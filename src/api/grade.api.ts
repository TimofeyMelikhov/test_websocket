import { axiosClient } from "./axiosClient";

interface IServerResponse {
  status: string;
  result: string;
}

export const gradeApi = {
  checkSocket: async (userSocketId: string) => {
    const response = await axiosClient.post<IServerResponse>(
      "",
      { userSocketId },
      {
        params: {
          method: "getInfo",
        },
      },
    );

    return response.data;
  },
};
