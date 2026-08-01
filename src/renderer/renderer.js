import './styles.css';
import { initUIController } from './ui-controller.js';

console.log('Renderer loaded');

// Initialize the UI controller which orchestrates all renderer modules
const app = initUIController();

// Export for use by other renderer modules
window.app = app;
