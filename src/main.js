import Phaser from 'phaser'
import { createConfig } from './config.js'
import BootScene from './scenes/Boot.js'
import PreloadScene from './scenes/Preload.js'
import MainMenuScene from './scenes/MainMenu.js'
import GameSelectScene from './scenes/GameSelect.js'
import ModePageScene from './scenes/ModePage.js'
import SettingsScene from './scenes/Settings.js'
import NightHuntScene from './scenes/NightHunt.js'
import FinaleScene from './scenes/Finale.js'
import DungeonCrawlScene from './scenes/DungeonCrawl.js'

const game = new Phaser.Game(
  createConfig([
    BootScene,
    PreloadScene,
    MainMenuScene,
    GameSelectScene,
    ModePageScene,
    SettingsScene,
    NightHuntScene,
    FinaleScene,
    DungeonCrawlScene,
  ]),
)
if (import.meta.env.DEV) window.__game = game
