import { useEffect, useRef, useState, useCallback } from "react";

type ServerMessage = {
  type: string;
  percent: string;
  message: string;
};

export const useWebSocket = () => {
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ServerMessage>(); // ← новое состояние
  const userSocketIdRef = useRef(window.crypto.randomUUID());
  const userSocketId = userSocketIdRef.current;

  useEffect(() => {
    const ws = new WebSocket(
      `wss://std-wt03.stdp.ru/services/main_ws_service?X-StatefulSocketId=${userSocketId}`,
    );

    socketRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket подключён");
      setIsConnected(true);
      ws.send(
        JSON.stringify({
          socket_action: "init_socket",
          socket_type: "adminTools",
        }),
      );
    };

    ws.onclose = (e) => {
      console.log(`❌ Соединение закрыто: ${e.code}`);
      setIsConnected(false);
    };

    ws.onerror = (e) => {
      console.error("Ошибка WebSocket", e);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (Array.isArray(data) && data[0]?.type === "progress") {
        const progress = data[0];
        setMessages(progress);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback(
    (data: any) => {
      if (socketRef.current && isConnected) {
        socketRef.current.send(JSON.stringify(data));
      }
    },
    [isConnected],
  );

  return {
    isConnected,
    userSocketId,
    messages,
    sendMessage,
  };
};
