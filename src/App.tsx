import "./App.css";
import { useCheckSocket } from "./hooks/useCheckSocket";
import { useWebSocket } from "./hooks/useWebSocket";

export function App() {
  const { isConnected, userSocketId, messages } = useWebSocket();
  const { data, refetch } = useCheckSocket(userSocketId);

  return (
    <div>
      <div>Статус: {isConnected ? "Подключён" : "Нет соединения"}</div>
      <div>ID сокета: {userSocketId}</div>

      <button onClick={() => refetch()}>Запрос на тест сокета</button>
      <div>Операция на сервере выполнена на {messages?.percent}%</div>
      {data && <div> {data.result} </div>}
    </div>
  );
}
