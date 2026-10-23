import { config } from '../config.js';
import * as supremaMock from './suprema.mock.js';
import * as supremaReal from './suprema.real.js';
import * as fichas24hMock from './fichas24h.mock.js';
import * as fichas24hReal from './fichas24h.real.js';

export const suprema = config.modes.suprema === 'real' ? supremaReal : supremaMock;
export const fichas24h = config.modes.fichas24h === 'real' ? fichas24hReal : fichas24hMock;
