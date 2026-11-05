import { config } from '../config.js';
import * as supremaMock from './suprema.mock.js';
import * as supremaApp from './suprema.app.js';
import * as supremaReal from './suprema.real.js';
import * as fichas24hMock from './fichas24h.mock.js';
import * as fichas24hReal from './fichas24h.real.js';

const SUPREMA = { mock: supremaMock, app: supremaApp, real: supremaReal };

export const suprema = SUPREMA[config.modes.suprema] || supremaMock;
// "guiado" não chama o Fichas 24h (o orquestrador pula essas etapas); o mock fica só como objeto inerte.
export const fichas24h = config.modes.fichas24h === 'real' ? fichas24hReal : fichas24hMock;
export const f24hGuided = config.modes.fichas24h === 'guiado';
