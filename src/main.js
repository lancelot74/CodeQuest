import Phaser from 'phaser'
import { createConfig } from './config.js'
import BootScene from './scenes/Boot.js'
import PreloadScene from './scenes/Preload.js'

new Phaser.Game(createConfig([BootScene, PreloadScene]))
