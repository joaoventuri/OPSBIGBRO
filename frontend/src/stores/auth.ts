import { create } from "zustand";

interface AuthState {
  token: string | null;
  user: { id: string; name: string; email: string } | null;
  workspaces: { id: string; name: string; slug: string; role: string }[];
  currentWorkspace: string | null;
  setAuth: (data: {
    token: string;
    user: { id: string; name: string; email: string };
    workspaces: { id: string; name: string; slug: string; role: string }[];
    currentWorkspace: string;
  }) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  workspaces: [],
  currentWorkspace: null,

  setAuth: (data) => {
    localStorage.setItem("obb_token", data.token);
    localStorage.setItem("obb_workspace", data.currentWorkspace);
    set({
      token: data.token,
      user: data.user,
      workspaces: data.workspaces,
      currentWorkspace: data.currentWorkspace,
    });
  },

  logout: () => {
    localStorage.removeItem("obb_token");
    localStorage.removeItem("obb_workspace");
    set({ token: null, user: null, workspaces: [], currentWorkspace: null });
  },

  hydrate: () => {
    const token = localStorage.getItem("obb_token");
    const workspace = localStorage.getItem("obb_workspace");
    if (token) set({ token, currentWorkspace: workspace });
  },
}));
