import { Route, Routes } from "react-router-dom";
import { ThemeToggle } from "./components/ThemeToggle";

function App() {
  return (
    <>
      <header className="app-header container">
        <span className="app-header__title">Go</span>
        <ThemeToggle />
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<div>Go URL Alias Service</div>} />
        </Routes>
      </main>
    </>
  );
}

export default App;
