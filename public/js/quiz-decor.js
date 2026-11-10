// What grows next to the quizzes: the knowledge house, or in the Christmas edition (SEASON
// 'christmas') a Christmas tree that gets decorated with every correct answer.
import { KnowledgeHouse } from './house.js';
import { QuizTree } from './xmas-quiz-tree.js';
import { CHRISTMAS } from './christmas.js';

/** Adds the house (or the tree) next to a quiz scene; it stays for the whole round. */
export function useHouse(scene) {
  scene.house = CHRISTMAS ? new QuizTree(scene) : new KnowledgeHouse(scene);
  scene.house.placeBeside(scene.eye);
  scene.group.add(scene.house.group);
  return scene.house;
}
