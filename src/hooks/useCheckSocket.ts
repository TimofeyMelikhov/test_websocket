import { useQuery } from "@tanstack/react-query";
import { gradeApi } from "../api/grade.api";

export const useCheckSocket = () => {
  return useQuery({
    queryKey: ["check socket"],
    queryFn: () => gradeApi.checkSocket(),
    staleTime: 60_000,
    enabled: false,
  });
};
