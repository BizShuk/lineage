import { createGame } from './app/createGame';
import './ui/styles.css';

const parent = document.querySelector<HTMLElement>('[data-testid="game-root"]');
if (parent === null) {
  throw new Error('找不到遊戲根元素');
}

createGame(parent);
