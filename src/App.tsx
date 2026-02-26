// import { useState } from "react";
import "./App.css";
import { useCheckSocket } from "./hooks/useCheckSocket";

export function App() {
  // const [state, setState] = useState<string>("");

  const ws = new WebSocket("wss://std-wt03.stdp.ru/services/main_ws_service");
  const { data, refetch } = useCheckSocket();

  console.log(data);

  ws.onopen = () => {
    // setState("CONNECTED");
    console.log("Соединение установлено");
  };

  ws.onerror = (e) => console.log(`Ошибка WebSocket ${e}`, "error");

  ws.onclose = (e) => {
    // setState("DISCONNECTED");
    console.log(`Соединение закрыто: code=${e.code}, reason=${e.reason}`);
  };

  ws.onmessage = (e) => {
    console.log(JSON.parse(e.data));
  };

  return (
    <div>
      <button onClick={() => refetch()}>Запрос на тест сокета</button>
    </div>
  );
}
