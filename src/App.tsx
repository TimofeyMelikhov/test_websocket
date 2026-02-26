import "./App.css";
import { useCheckSocket } from "./hooks/useCheckSocket";
import { useWebSocket } from "./hooks/useWebSocket";

export function App() {
  const { isConnected, socketId } = useWebSocket();
  const { data, refetch } = useCheckSocket();

  return (
    <div>
      <div>Статус: {isConnected ? "Подключён" : "Нет соединения"}</div>
      <div>ID сокета: {socketId}</div>

      <button onClick={() => refetch()}>Запрос на тест сокета</button>
      <div>Ответ от API: {data}</div>
    </div>
  );
}
