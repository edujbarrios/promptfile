#!/usr/bin/env node
import { createCLI } from './cli/index.js';

const cli = createCLI();
cli.parse(process.argv);
