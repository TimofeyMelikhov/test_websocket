import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'
type LogLevel = 'info' | 'recv' | 'error'

type LogEntry = {
  id: number
  time: string
  message: string
  level: LogLevel
}

const SOCKET_ID_STORAGE_KEY = 'websoft.statefulSocketId'
const SOCKET_ID_KEYS = ['socket_id', 'socketId', 'stateful_socket_id', 'statefulSocketId', 'id']

function nowTime(): string {
  return new Date().toLocaleTimeString()
}

function defaultWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/services/main_ws_service`
}

function defaultActionUrl(): string {
  return `${window.location.origin}/socket_action`
}

function extractSocketId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const obj = value as Record<string, unknown>

  for (const key of SOCKET_ID_KEYS) {
    const candidate = obj[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  for (const key of ['data', 'result', 'payload']) {
    const candidate = extractSocketId(obj[key])
    if (candidate) {
      return candidate
    }
  }

  return null
}

function toWebSocketUrl(rawUrl: string, statefulSocketId: string): string {
  const url = new URL(rawUrl, window.location.origin)

  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }

  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  const normalizedId = statefulSocketId.trim()
  if (normalizedId) {
    url.searchParams.set('X-StatefulSocketId', normalizedId)
  } else {
    url.searchParams.delete('X-StatefulSocketId')
  }

  return url.toString()
}

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED')
  const [wsUrl, setWsUrl] = useState<string>(() => defaultWsUrl())
  const [actionUrl, setActionUrl] = useState<string>(() => defaultActionUrl())
  const [statefulSocketId, setStatefulSocketId] = useState<string>(() => sessionStorage.getItem(SOCKET_ID_STORAGE_KEY) ?? '')
  const [payload, setPayload] = useState<string>('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [lastPingAt, setLastPingAt] = useState<string>('—')
  const [lastPongAt, setLastPongAt] = useState<string>('—')
  const [enableHeartbeat, setEnableHeartbeat] = useState<boolean>(true)
  const [heartbeatSeconds, setHeartbeatSeconds] = useState<number>(30)

  const socketRef = useRef<WebSocket | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const logIdRef = useRef<number>(0)

  const appendLog = (message: string, level: LogLevel = 'info') => {
    logIdRef.current += 1
    setLogs((prev) => [
      ...prev,
      {
        id: logIdRef.current,
        time: nowTime(),
        message,
        level,
      },
    ])
  }

  const clearHeartbeat = () => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }

  const sendRawMessage = (message: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendLog('Нет активного WebSocket-соединения', 'error')
      return false
    }

    socket.send(message)
    appendLog(`Отправлено: ${message}`)
    return true
  }

  const sendPing = () => {
    const frame = JSON.stringify({ type: 'ping', t: Date.now() })
    if (sendRawMessage(frame)) {
      setLastPingAt(nowTime())
    }
  }

  const maybeAutoPong = (data: string): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      const parsed = JSON.parse(data) as { type?: unknown; t?: unknown }

      if (parsed?.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', t: typeof parsed.t === 'number' ? parsed.t : Date.now() }))
        appendLog('Получен ping, отправлен pong')
        return true
      }

      if (parsed?.type === 'pong') {
        setLastPongAt(nowTime())
        appendLog('Получен pong', 'recv')
        return true
      }
    } catch {
      const normalized = data.trim().toLowerCase()
      if (normalized === 'ping') {
        socket.send('pong')
        appendLog('Получен "ping", отправлен "pong"')
        return true
      }

      if (normalized === 'pong') {
        setLastPongAt(nowTime())
        appendLog('Получен "pong"', 'recv')
        return true
      }
    }

    return false
  }

  const startHeartbeat = () => {
    clearHeartbeat()

    if (!enableHeartbeat) {
      return
    }

    const intervalSeconds = Number.isFinite(heartbeatSeconds) && heartbeatSeconds >= 5 ? heartbeatSeconds : 30

    heartbeatTimerRef.current = window.setInterval(() => {
      sendPing()
    }, intervalSeconds * 1000)
  }

  const disconnect = (code = 1000, reason = 'manual') => {
    const socket = socketRef.current

    clearHeartbeat()

    if (!socket) {
      setConnectionState('DISCONNECTED')
      return
    }

    socketRef.current = null

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(code, reason)
    }

    setConnectionState('DISCONNECTED')
    appendLog(`Отключено: ${reason}`)
  }

  const connect = () => {
    try {
      const targetUrl = toWebSocketUrl(wsUrl, statefulSocketId)

      if (socketRef.current) {
        disconnect(1000, 'reconnect')
      }

      const socket = new WebSocket(targetUrl)
      socketRef.current = socket
      setConnectionState('CONNECTING')
      appendLog(`Подключение: ${targetUrl}`)

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          return
        }

        setConnectionState('CONNECTED')
        appendLog('Соединение установлено')
        startHeartbeat()
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        if (!maybeAutoPong(event.data)) {
          appendLog(`Получено: ${event.data}`, 'recv')
        }
      }

      socket.onerror = () => {
        if (socketRef.current === socket) {
          appendLog('Ошибка WebSocket', 'error')
        }
      }

      socket.onclose = (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null
          setConnectionState('DISCONNECTED')
          clearHeartbeat()
        }

        appendLog(`Закрыто: code=${event.code}, reason=${event.reason || 'no_reason'}`)
      }
    } catch (error) {
      appendLog(`Ошибка подключения: ${String(error)}`, 'error')
      setConnectionState('DISCONNECTED')
    }
  }

  const requestStatefulSocketId = async () => {
    try {
      const url = new URL(actionUrl, window.location.origin)
      url.searchParams.set('command', 'init_socket')

      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const text = await response.text()
      let parsed: unknown = text

      try {
        parsed = JSON.parse(text)
      } catch {
        // keep plain text
      }

      const socketId = extractSocketId(parsed)

      if (!socketId) {
        throw new Error('Сервер не вернул socket_id')
      }

      setStatefulSocketId(socketId)
      appendLog(`Получен stateful socket id: ${socketId}`)
    } catch (error) {
      appendLog(`Не удалось получить socket id: ${String(error)}`, 'error')
    }
  }

  const submitSendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const message = payload.trim()
    if (!message) {
      appendLog('Пустое сообщение не отправляется', 'error')
      return
    }

    sendRawMessage(message)
  }

  useEffect(() => {
    if (statefulSocketId.trim()) {
      sessionStorage.setItem(SOCKET_ID_STORAGE_KEY, statefulSocketId.trim())
      return
    }

    sessionStorage.removeItem(SOCKET_ID_STORAGE_KEY)
  }, [statefulSocketId])

  useEffect(() => {
    if (connectionState !== 'CONNECTED') {
      clearHeartbeat()
      return
    }

    startHeartbeat()
  }, [connectionState, enableHeartbeat, heartbeatSeconds])

  useEffect(() => {
    return () => {
      clearHeartbeat()

      const socket = socketRef.current
      socketRef.current = null

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close(1000, 'component_unmount')
      }
    }
  }, [])

  return (
    <div className="app">
      <h1>WebSoft WebSocket Client (React)</h1>

      <section className="panel">
        <div className="status" data-state={connectionState}>
          Статус: <strong>{connectionState}</strong>
        </div>

        <label htmlFor="wsUrl">URL WebSocket</label>
        <input
          id="wsUrl"
          value={wsUrl}
          onChange={(event) => setWsUrl(event.target.value)}
          placeholder="wss://domain.ru/services/main_ws_service"
        />

        <label htmlFor="statefulSocketId">X-StatefulSocketId</label>
        <input
          id="statefulSocketId"
          value={statefulSocketId}
          onChange={(event) => setStatefulSocketId(event.target.value)}
          placeholder="Например: ws-user-7177256154427237596"
        />

        <label htmlFor="actionUrl">HTTP endpoint для init_socket</label>
        <input
          id="actionUrl"
          value={actionUrl}
          onChange={(event) => setActionUrl(event.target.value)}
          placeholder="https://domain.ru/socket_action"
        />

        <div className="controls">
          <button type="button" onClick={requestStatefulSocketId}>Получить socket id</button>
          <button type="button" onClick={connect} disabled={connectionState === 'CONNECTING' || connectionState === 'CONNECTED'}>
            Подключиться
          </button>
          <button type="button" onClick={() => disconnect(1000, 'manual')} disabled={connectionState === 'DISCONNECTED'}>
            Отключиться
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Heartbeat</h2>

        <label className="inline-label" htmlFor="enableHeartbeat">
          <input
            id="enableHeartbeat"
            type="checkbox"
            checked={enableHeartbeat}
            onChange={(event) => setEnableHeartbeat(event.target.checked)}
          />
          Включить ping
        </label>

        <div className="heartbeat-grid">
          <label htmlFor="heartbeatSeconds">Интервал (сек, минимум 5)</label>
          <input
            id="heartbeatSeconds"
            type="number"
            min={5}
            value={heartbeatSeconds}
            onChange={(event) => setHeartbeatSeconds(Number(event.target.value || 30))}
          />
          <button type="button" onClick={sendPing} disabled={connectionState !== 'CONNECTED'}>
            Отправить ping
          </button>
        </div>

        <p>Последний ping: {lastPingAt}</p>
        <p>Последний pong: {lastPongAt}</p>
      </section>

      <section className="panel">
        <h2>Сообщение</h2>
        <form onSubmit={submitSendMessage}>
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder='Например: {"socket_action":"init_socket","socket_type":"ws_group"}'
          />

          <div className="controls">
            <button type="submit" disabled={connectionState !== 'CONNECTED'}>
              Отправить
            </button>
            <button type="button" onClick={() => setLogs([])}>
              Очистить лог
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Лог</h2>
        <div className="log">
          {logs.map((entry) => (
            <div key={entry.id} className={`log-entry ${entry.level}`}>
              [{entry.time}] {entry.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
