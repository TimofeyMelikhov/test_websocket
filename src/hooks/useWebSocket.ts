import { useEffect, useRef, useState, useCallback } from "react";

type ServerMessage = {
  type: string;
  data: any;
};

export const useWebSocket = () => {
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket("wss://std-wt03.stdp.ru/services/main_ws_service");

    socketRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket подключён");
      setIsConnected(true);
    };

    ws.onclose = (e) => {
      console.log(`❌ Соединение закрыто: ${e.code}`);
      setIsConnected(false);
    };

    ws.onerror = (e) => {
      console.error("Ошибка WebSocket", e);
    };

    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      console.log("📩 Сообщение:", message);

      if (message.type === "connectionId") {
        setSocketId(message.data);
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
    socketId,
    sendMessage,
  };
};
