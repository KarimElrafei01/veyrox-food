import { base, react, frontendFeatureBoundaries } from '../../eslint.config.js';

export default [...base, ...react, ...frontendFeatureBoundaries()];
