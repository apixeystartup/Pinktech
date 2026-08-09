import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import FormPage from "./pages/FormPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/forms/:moduleId" element={<FormPage />} />
      <Route path="/admin/forms" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
