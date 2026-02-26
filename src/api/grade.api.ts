import { axiosClient } from "./axiosClient";

export const gradeApi = {
  checkSocket: async () => {
    const response = await axiosClient.get<any>("", {
      params: {
        method: "getInfo",
      },
    });

    return response.data;
  },
};
