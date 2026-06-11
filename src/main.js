import Phaser from 'phaser'
import { createConfig } from './config.js'
import BootScene from './scenes/Boot.js'
import PreloadScene from './scenes/Preload.js'
import MainMenuScene from './scenes/MainMenu.js'
import GameSelectScene from './scenes/GameSelect.js'
import ModePageScene from './scenes/ModePage.js'
import WorldSelectScene from './scenes/WorldSelect.js'
import LevelSelectScene from './scenes/LevelSelect.js'
import GameScene from './scenes/Game.js'
import HUDScene from './scenes/HUD.js'
import GameOverScene from './scenes/GameOver.js'
import CodexScene from './scenes/Codex.js'
import SettingsScene from './scenes/Settings.js'
import AgeOfWarScene from './scenes/AgeOfWar.js'
import NightHuntScene from './scenes/NightHunt.js'
import FinaleScene from './scenes/Finale.js'

new Phaser.Game(
  createConfig([
    BootScene,
    PreloadScene,
    MainMenuScene,
    GameSelectScene,
    ModePageScene,
    WorldSelectScene,
    LevelSelectScene,
    GameScene,
    HUDScene,
    GameOverScene,
    CodexScene,
    SettingsScene,
    AgeOfWarScene,
    NightHuntScene,
    FinaleScene,
  ]),
)
