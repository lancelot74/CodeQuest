import Phaser from 'phaser'
import { createConfig } from './config.js'
import BootScene from './scenes/Boot.js'
import PreloadScene from './scenes/Preload.js'
import MainMenuScene from './scenes/MainMenu.js'
import CharacterSelectScene from './scenes/CharacterSelect.js'
import WorldSelectScene from './scenes/WorldSelect.js'
import LevelSelectScene from './scenes/LevelSelect.js'
import GameScene from './scenes/Game.js'
import GameOverScene from './scenes/GameOver.js'
import CodexScene from './scenes/Codex.js'

new Phaser.Game(
  createConfig([
    BootScene,
    PreloadScene,
    MainMenuScene,
    CharacterSelectScene,
    WorldSelectScene,
    LevelSelectScene,
    GameScene,
    GameOverScene,
    CodexScene,
  ]),
)
