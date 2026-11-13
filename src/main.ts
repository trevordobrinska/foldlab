import "./style.css";
import { load, save } from "./storage";

// The home screen. Replace this with the Game; keep the house button in
// index.html (suite rule 5).
const screen = document.querySelector<HTMLElement>("#screen")!;
const visits = Number(load("visits") ?? "0") + 1;
save("visits", String(visits));

screen.innerHTML = `
  <h1>foldlab</h1>
  <p>A new Game in the Dobrinska Arcade. Visit ${visits}.</p>
`;
