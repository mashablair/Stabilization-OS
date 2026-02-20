import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { seedDatabase, transitionDuePendingTasks } from "./db.ts";

async function init() {
  await seedDatabase();
  const transitioned = await transitionDuePendingTasks();
  if (transitioned > 0) {
    console.log(`${transitioned} task(s) became actionable.`);
  }
}

init().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
