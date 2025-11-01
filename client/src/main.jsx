import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CallProvider } from "./context/CallContext";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <CallProvider>
        <App />
      </CallProvider>
    </AuthProvider>
  </BrowserRouter>
);