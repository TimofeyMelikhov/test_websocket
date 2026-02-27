import { useQuery } from "@tanstack/react-query";
import { gradeApi } from "../api/grade.api";

export const useCheckSocket = (userSocketId: string) => {
  return useQuery({
    queryKey: ["check socket"],
    queryFn: () => gradeApi.checkSocket(userSocketId),
    staleTime: 60_000,
    enabled: false,
  });
};
