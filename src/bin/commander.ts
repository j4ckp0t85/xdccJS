import commander, { program } from 'commander'
import { version } from '../package.json'
import { BinError } from './errorhandler'
import * as path from 'path'
import { Params } from '..'
import { Connect } from '../connect'

export type savedParams = {
  wait: number
  bot: string
}
export interface InterfaceCLI extends commander.Command {
  host?: string
  port?: number
  bot?: string
  download?: string[]
  path?: string
  nick?: string
  chan?: string
  retry?: number
  passivePort?: number
  noRandomize?: string
  saveProfile?: string
  deleteProfile?: string
  setProfile?: string
  listProfile?: string
}

export class BaseCommander {
  program: InterfaceCLI
  constructor() {
    this.program = program
    this.parseProgram()
  }
  private parseProgram(): void {
    this.program
      .name('xdccJS')
      .version(version)
      .option('-h, --host <server>', 'IRC server address')
      .option('--port <number>', 'IRC server port', this.parseIfNotInt)
      .option('-b, --bot <botname>', 'xdcc bot nickname')
      .option('-d, --download <packs...>', 'pack number(s) to download')
      .option('-p, --path <path>', 'download path', path.normalize)
      .option('-n, --nickname <nickname>', 'Your IRC nickname', 'xdccJS')
      .option('-c, --chan [chan...]', 'channel(s) to join (without #)')
      .option('-r, --retry <number>', 'number of attempts before skipping pack', this.parseIfNotInt)
      .option('--passive-port <number>', 'port used for passive dccs', this.parseIfNotInt)
      .option('--no-randomize', 'removes random numbers to nickname')
      .option(
        '-w, --wait [number]',
        'wait time (in seconds) in channel(s) before sending download request',
        this.parseIfNotInt,
        0
      )
      .option('--save-profile [string]', 'save current options as a profile')
      .option('--delete-profile [string]', 'delete profile')
      .option('--set-profile [string]', 'set profile as default')
      .option('--list-profile', 'list all available profiles')
      .parse()
  }
  private parseIfNotInt(numstring: string | number): number {
    if (typeof numstring === 'string') {
      const res = parseInt(numstring)
      if (isNaN(res)) {
        throw new BinError('WRONG NUMBER')
      }
      return res
    }
    return numstring
  }
  protected log(string: string, pad = 0): void {
    console.error(''.padStart(pad) + Connect.replace(string))
  }
  protected xdccJSOPTS(): Params {
    if (typeof this.program.host === 'undefined') {
      throw new BinError('%danger% No server')
    }
    return {
      host: this.program.host,
      port: this.program.port,
      nick: this.program.nick,
      chan: this.program.chan,
      path: this.program.path,
      retry: this.program.retry,
      randomizeNick: this.program.noRandomize ? false : true,
      passivePort: [this.program.passivePort || 5001],
      verbose: true,
    }
  }

  protected xdccBINOPTS(): [Params, savedParams] {
    if (typeof this.program.bot === 'undefined') {
      throw new BinError('%danger% a bot must be specified')
    }
    return [this.xdccJSOPTS(), { wait: this.program.wait, bot: this.program.bot }]
  }
}