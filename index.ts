/* eslint-disable @typescript-eslint/member-delimiter-style */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="@types/irc-framework.ts"/>
import { Client } from 'irc-framework'
import * as fs from 'fs'
import * as path from 'path'
import * as net from 'net'
import * as http from 'http'
import * as ProgressBar from 'progress'
import * as colors from 'colors/safe'
/**
 * XDCC
 * @noInheritDoc
 */
export default class XDCC extends Client {
  private nick: string
  private chan: string[]
  private resumequeue: {
    nick: string
    ip: string
    length: number
    token: number
  }[] = []
  /**
   * Download path (absolute or relative) <br/>
   * value inherited from {@link constructor}'s parameter {@link Params.path}
   * @see {@link download}
   * @example
   * ```js
   * // absolute path :
   * params.path = '/home/user/downloads'
   * const xdccJS = new XDCC(params)
   * ```
   * @example
   * ```js
   * // relative path
   * params.path = 'downloads' //=> /your/project/path/downloads
   * const xdccJS = new XDCC(params)
   * ```
   * @example
   * ```js
   * param.path = 'downloads'
   * const xdccJS = new XDCC(param)
   *
   * // ... later in your code
   *  xdccJS.path = '/another/path'
   * ```
   */
  private path: false | string = false
  private verbose: boolean
  /**
   * Array of port(s) to use for passive DCCs <br/>
   * number of port determine how many passive dcc you can run in parallel. <br/>
   * default value : `[5001]`
   */
  private passivePort: number[] = [5001]
  private portInUse: number[] = []
  private ip!: number
  private timeouts!: NodeJS.Timeout
  /**
     * Initiate IRC connection, see {@link Params} for a complete description of all parameters
     * @fires {@link xdcc-ready}
     * @remark If you want to use pipes {@link Params.path} must be set to false, see {@link XDCC.download} examples
     * @example
     * ```javascript
     * let opts = {
     *  host: 'irc.server.net',
     *  port: 6667,
     *  nick: 'JiPaix',
     *  chan: ['#itsMe', '#JiPaix' ],
     *  path: 'downloads',
     *  verbose: true,
     *  randomizeNick: true,
     *  passivePort : [5001, 5002, 5003]
     * }
     *
     * const xdccJS = new XDCC(opts)
     * ```

     */
  constructor(parameters: Params) {
    super()
    this._is('host', parameters.host, 'string')
    parameters.port = this._is('port', parameters.port, 'number', 6667)
    parameters.nick = this._is(
      'nick',
      parameters.nick,
      'string',
      this.nickRandomizer('xdccJS')
    )
    if (this._is('randomizeNick', parameters.randomizeNick, 'boolean', false)) {
      this.nick = this.nickRandomizer(
        parameters.nick ? parameters.nick : this.nickRandomizer('xdccJS')
      )
    } else {
      this.nick = parameters.nick
        ? parameters.nick
        : this.nickRandomizer('xdccJS')
    }
    this.verbose = this._is('verbose', parameters.verbose, 'boolean', false)
    parameters.passivePort = this._is(
      'passivePort',
      parameters.passivePort,
      'object',
      [5001]
    )
    if (typeof parameters.path === 'string') {
      this.path = path.normalize(parameters.path)
      if (!path.isAbsolute(this.path)) {
        this.path = path.join(path.resolve('./'), parameters.path)
      }
      if (!fs.existsSync(this.path)) {
        fs.mkdirSync(this.path, {
          recursive: true,
        })
      }
    } else {
      this.path = false
    }
    if (typeof parameters.chan === 'string') {
      this.chan = [this.checkHashtag(parameters.chan, true)]
    } else if (Array.isArray(parameters.chan)) {
      this.chan = parameters.chan
    } else if (!parameters.chan) {
      this.chan = [this.checkHashtag('xdccJS', true)]
    } else {
      throw TypeError(
        `unexpected type of 'chan': an array of strings was expected'`
      )
    }
    this.getRemoteIP()
    this.connect({
      host: parameters.host,
      port: parameters.port,
      nick: this.nick,
      encoding: 'utf8',
      // eslint-disable-next-line @typescript-eslint/camelcase
      auto_reconnect: true,
      // eslint-disable-next-line @typescript-eslint/camelcase
      ping_interval: 30,
      // eslint-disable-next-line @typescript-eslint/camelcase
      ping_timeout: 120,
    })
    this.live(parameters.host)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _is(name: string, variable: any, type: string, def?: any): any {
    if (typeof variable !== type) {
      if (typeof def === 'undefined') {
        throw TypeError(
          `unexpected type of '${name}': a ${type} was expected but got '${typeof variable}'`
        )
      } else {
        return def
      }
    } else {
      return variable
    }
  }

  private getRemoteIP(): void {
    const options = {
      host: 'ipv4bot.whatismyipaddress.com',
      port: 80,
      path: '/',
    }
    http.get(options, res => {
      let data = ''
      res.on('data', chunk => {
        data = data + chunk
      })
      res.on('end', () => {
        const b = Buffer.from(data).toString()
        const d = b.split('.')
        const res = ((+d[0] * 256 + +d[1]) * 256 + +d[2]) * 256 + +d[3]
        this.ip = res
      })
    })
    return
  }

  private live(ircServer: string): void {
    const self = this
    this.on('connected', () => {
      for (let index = 0; index < this.chan.length; index++) {
        const channel = this.channel(this.checkHashtag(this.chan[index], true))
        channel.join()
      }
      if (this.verbose) {
        console.error(
          `${colors.bold(colors.green('\u2713'))} connected to: ${colors.yellow(
            ircServer
          )}`
        )
        console.error(
          `\u2937`.padStart(2),
          `${colors.bold(colors.green('\u2713'))} joined: ${this.chan.map(
            e => `${colors.yellow(e)}`
          )}`
        )
      }
      self.emit('xdcc-ready')
    })
    this.on('request', (args: { target: string; packet: string | number }) => {
      this.say(args.target, `xdcc send ${args.packet}`)
      if (this.verbose) {
        console.error(
          `\u2937`.padStart(4),
          `${colors.bold(
            colors.green('\u2713')
          )} sending command: /MSG ${colors.yellow(
            args.target
          )} xdcc send ${colors.yellow(args.packet.toString())}`
        )
      }
      this.timeouts = this.setupTimeout(
        [true, args.target],
        {
          eventname: this.path ? 'download-err' : 'pipe-err',
          message: `timeout: no response from ${colors.yellow(args.target)}`,
          padding: 6,
        },
        1000 * 15
      )
    })
    this.on('request-batch', (args: { target: string; packet: number[] }) => {
      if (!this.path) {
        throw new Error(`downloadBatch() can't be used in pipe mode.`)
      }
      let i = 0
      if (i < args.packet.length) {
        this.say(args.target, `xdcc send ${args.packet[i]}`)
        if (this.verbose) {
          console.error(
            `\u2937`.padStart(4),
            `${colors.bold(
              colors.green('\u2713')
            )} sending command: /MSG ${colors.yellow(
              args.target
            )} xdcc send ${colors.yellow(args.packet[i].toString())}`
          )
        }
        i++
      }
      this.on('downloaded', () => {
        if (i < args.packet.length) {
          this.say(args.target, `xdcc send ${args.packet[i]}`)
          if (this.verbose) {
            console.error(
              `\u2937`.padStart(4),
              `${colors.bold(
                colors.green('\u2713')
              )} sending command: /MSG ${colors.yellow(
                args.target
              )} xdcc send ${colors.yellow(args.packet[i].toString())}`
            )
          }
          i++
        } else {
          this.emit('batch-complete', args)
        }
      })
    })
    this.on('ctcp request', (resp: { [prop: string]: string }): void => {
      if (typeof resp.message !== 'string') {
        throw new TypeError(`CTCP MSG: ${resp.message}`)
      }
      if (this.path) {
        this.downloadToFile(resp)
      } else {
        this.downloadToPipe(resp)
      }
    })
  }

  private downloadToPipe(resp: { [prop: string]: string }): void {
    const self = this
    const fileInfo = this.parseCtcp(resp.message, resp.nick)
    if (fileInfo) {
      let received = 0
      const sendBuffer = Buffer.alloc(4)
      const available = this.passivePort.filter(
        port => !this.portInUse.includes(port)
      )
      const pick = available[Math.floor(Math.random() * available.length)]
      let timeout: NodeJS.Timeout
      const bar = this.setupProgressBar(fileInfo.length)
      clearTimeout(this.timeouts)
      if (fileInfo.port === 0) {
        const server = net.createServer(client => {
          timeout = this.setupTimeout(
            [true, resp.nick],
            {
              eventname: 'pipe-err',
              message: `timeout: no initial connection`,
              padding: 6,
              bar: bar,
              fileInfo: fileInfo,
            },
            1000 * 10,
            () => {
              server.close(() => {
                this.portInUse = this.portInUse.filter(p => p !== pick)
              })
            }
          )
          this.emit('pipe-start', fileInfo)
          client.on('data', data => {
            clearTimeout(timeout)
            received += data.length
            sendBuffer.writeUInt32BE(received, 0)
            client.write(sendBuffer)
            self.emit('pipe-data', data, received)
            if (this.verbose) {
              bar.tick(data.length)
            }
            timeout = this.setupTimeout(
              [true, resp.nick],
              {
                eventname: 'pipe-err',
                message: `timeout: not receiving data`,
                padding: 6,
                bar: bar,
                fileInfo: fileInfo,
              },
              1000 * 10,
              () => {
                server.close(() => {
                  this.portInUse = this.portInUse.filter(p => p !== pick)
                })
              }
            )
          })
          client.on('end', () => {
            clearTimeout(timeout)
            server.close(() => {
              this.portInUse = this.portInUse.filter(p => p !== pick)
              self.emit('pipe-downloaded', fileInfo)
              if (this.verbose) {
                console.error(`pipe download done`)
              }
            })
          })
          client.on('error', err => {
            clearTimeout(timeout)
            server.close(() => {
              this.portInUse = this.portInUse.filter(p => p !== pick)
              this.say(resp.nick, 'XDCC CANCEL')
              self.emit('pipe-err', err, fileInfo)
              if (this.verbose) {
                bar.interrupt(
                  `\u2937`.padStart(8) +
                    ` ${colors.bold(colors.red('\u0058'))} ` +
                    err.message
                )
              }
            })
          })
        })
        server.on('listening', () => {
          this.raw(
            `PRIVMSG ${resp.nick} ${String.fromCharCode(1)}DCC SEND ${
              fileInfo.file
            } ${this.ip} ${pick} ${fileInfo.length} ${
              fileInfo.token
            }${String.fromCharCode(1)}`
          )
        })
        if (pick) {
          this.portInUse = this.portInUse.filter(p => p !== pick)
          server.listen(pick, '0.0.0.0')
        } else {
          server.close(() => {
            this.portInUse = this.portInUse.filter(p => p !== pick)
            this.say(resp.nick, 'XDCC CANCEL')
            const err = new Error('all passive ports are currently used')
            self.emit('pipe-err', err, fileInfo)
            if (this.verbose) {
              bar.interrupt(
                `\u2937`.padStart(6) +
                  ` ${colors.bold(colors.red('\u0058'))} ` +
                  err.message
              )
            }
          })
        }
        server.on('error', err => {
          clearTimeout(timeout)
          server.close(() => {
            this.portInUse = this.portInUse.filter(p => p !== pick)
            this.say(resp.nick, 'XDCC CANCEL')
            self.emit('pipe-err', err, fileInfo)
            if (this.verbose) {
              bar.interrupt(
                `\u2937`.padStart(6) +
                  ` ${colors.bold(colors.red('\u0058'))} ` +
                  err.message
              )
            }
          })
        })
      } else {
        let timeout = this.setupTimeout(
          [true, resp.nick],
          {
            eventname: 'pipe-err',
            message: `timeout: couldn't connect to: ${colors.yellow(
              `${fileInfo.ip}:${fileInfo.port}`
            )}`,
            padding: 6,
            fileInfo: fileInfo,
            bar: bar,
          },
          1000 * 10
        )
        const client = net.connect(fileInfo.port, fileInfo.ip)
        client.on('connect', () => {
          self.emit('pipe-start', fileInfo)
          clearTimeout(timeout)
          timeout = this.setupTimeout(
            [true, resp.nick],
            {
              eventname: 'pipe-err',
              message: `timeout: not receiving data`,
              padding: 6,
              bar: bar,
            },
            1000 * 2
          )
          if (this.verbose) {
            console.error(
              `\u2937`.padStart(6),
              `${colors.bold(
                colors.green('\u2713')
              )} opening connection with bot: ${colors.yellow(
                `${fileInfo.ip}:${fileInfo.port}`
              )}`
            )
          }
        })
        client.on('data', data => {
          clearTimeout(timeout)
          received += data.length
          sendBuffer.writeUInt32BE(received, 0)
          client.write(sendBuffer)
          self.emit('pipe-data', data, received)
          timeout = this.setupTimeout(
            [true, resp.nick],
            {
              eventname: 'pipe-err',
              message: `timeout: not receiving data`,
              padding: 6,
              bar: bar,
            },
            1000 * 2
          )
          if (this.verbose) {
            bar.tick(data.length)
          }
        })
        client.on('end', () => {
          clearTimeout(timeout)
          self.emit('pipe-downloaded', fileInfo)
          if (this.verbose) {
            console.error(
              `\u2937`.padStart(6),
              `${colors.bold(colors.green('\u2713'))} done: ${colors.yellow(
                fileInfo.file
              )}`
            )
          }
        })
        client.on('error', err => {
          this.say(resp.nick, 'XDCC CANCEL')
          self.emit('pipe-err', err, fileInfo)
        })
      }
    }
  }

  private downloadToFile(resp: { [prop: string]: string }): void {
    const fileInfo = this.parseCtcp(resp.message, resp.nick)
    if (fileInfo) {
      const timeout = this.setupTimeout(
        [true, resp.nick],
        {
          eventname: 'download-err',
          message: `couldn't connect to: ${colors.yellow(
            `${fileInfo.ip}:${fileInfo.port}`
          )}`,
          padding: 6,
        },
        10000
      )
      if (fs.existsSync(fileInfo.filePath)) {
        clearTimeout(timeout)
        clearTimeout(this.timeouts)
        let position = fs.statSync(fileInfo.filePath).size
        if (fileInfo.length === position) {
          position = position - 8192
        }
        if (fileInfo.type === 'DCC SEND') {
          const quotedFilename = /\s/.test(fileInfo.file)
            ? `"${fileInfo.file}"`
            : fileInfo.file
          this.ctcpRequest(
            resp.nick,
            'DCC RESUME',
            quotedFilename,
            fileInfo.port,
            position,
            fileInfo.token
          )
          this.resumequeue.push({
            nick: resp.nick,
            ip: fileInfo.ip,
            length: fileInfo.length,
            token: fileInfo.token,
          })
          this.timeouts = this.setupTimeout(
            [true, resp.nick],
            {
              eventname: 'download-err',
              message: `couldn't resume download of ${colors.yellow(
                fileInfo.file
              )}`,
              padding: 6,
            },
            1000 * 10,
            () => {
              if (fileInfo.port === 0) {
                console.error(
                  `\u2937`.padStart(4),
                  `${colors.bold(
                    colors.cyan('\u2139')
                  )} resume not supported by bot ${colors.yellow(
                    resp.nick
                  )} attempting to redownload ${colors.yellow(
                    fileInfo.file
                  )} from start`
                )
                fs.unlinkSync(fileInfo.filePath)
                const file = fs.createWriteStream(fileInfo.filePath)
                file.on('ready', () => {
                  this.passiveToFile(file, fileInfo, timeout, resp.nick)
                })
              }
            }
          )
        } else if (fileInfo.type === 'DCC ACCEPT') {
          if (this.verbose) {
            console.error(
              `\u2937`.padStart(6),
              `${colors.bold(
                colors.cyan('\u2139')
              )} resuming download of: ${colors.yellow(fileInfo.file)}`
            )
          }
          fileInfo.position = fileInfo.position ? fileInfo.position : 0
          fileInfo.length = fileInfo.length - fileInfo.position
          const file = fs.createWriteStream(fileInfo.filePath, {
            flags: 'r+',
            start: fileInfo.position,
          })
          file.on('ready', () => {
            if (fileInfo.port === 0) {
              clearTimeout(timeout)
              clearTimeout(this.timeouts)
              this.passiveToFile(file, fileInfo, timeout, resp.nick)
            } else {
              clearTimeout(this.timeouts)
              this.activeToFile(file, fileInfo, timeout, resp.nick)
            }
          })
        }
      } else {
        const file = fs.createWriteStream(fileInfo.filePath)
        file.on('ready', () => {
          if (this.verbose) {
            console.error(
              `\u2937`.padStart(6),
              `${colors.bold(
                colors.cyan('\u2139')
              )} starting download of: ${colors.yellow(fileInfo.file)}`
            )
          }
          if (fileInfo.port === 0) {
            clearTimeout(timeout)
            clearTimeout(this.timeouts)
            this.passiveToFile(file, fileInfo, timeout, resp.nick)
          } else {
            clearTimeout(this.timeouts)
            this.activeToFile(file, fileInfo, timeout, resp.nick)
          }
        })
      }
    }
  }

  private activeToFile(
    file: fs.WriteStream,
    fileInfo: FileInfo,
    timeout: NodeJS.Timeout,
    nick: string
  ): void {
    const bar = this.setupProgressBar(fileInfo.length)
    const self = this
    let received = 0
    const sendBuffer = Buffer.alloc(4)
    const client = net.connect(fileInfo.port, fileInfo.ip)
    client.on('connect', () => {
      self.emit('download-start', fileInfo)
      clearTimeout(timeout)
      timeout = this.setupTimeout(
        [true, nick],
        {
          eventname: 'download-err',
          message: `timeout: connected but not receiving data`,
          padding: 6,
          bar: bar,
          fileInfo: fileInfo,
        },
        1000 * 2
      )
      if (this.verbose) {
        console.error(
          `\u2937`.padStart(6),
          `${colors.bold(
            colors.green('\u2713')
          )} opening connection with bot: ${colors.yellow(
            `${fileInfo.ip}:${fileInfo.port}`
          )}`
        )
      }
    })
    client.on('data', data => {
      clearTimeout(timeout)
      file.write(data)
      received += data.length
      sendBuffer.writeUInt32BE(received, 0)
      client.write(sendBuffer)
      self.emit('downloading', received, fileInfo)
      if (received < fileInfo.length) {
        timeout = this.setupTimeout(
          [true, nick],
          {
            eventname: 'download-err',
            message: `timeout not receiving data`,
            padding: 6,
            fileInfo: fileInfo,
            bar: bar,
          },
          1000 * 2
        )
      }
      if (this.verbose) {
        bar.tick(data.length)
      }
      if (received === fileInfo.length) {
        client.end()
      }
    })
    client.on('end', () => {
      file.end()
      clearTimeout(timeout)
      if (this.verbose) {
        console.error(
          `\u2937`.padStart(8),
          `${colors.bold(colors.green('\u2713'))} done: \x1b[36m${
            file.path
          }\x1b[0m`
        )
      }
      self.emit('downloaded', fileInfo)
    })
    client.on('error', err => {
      file.end()
      this.say(nick, 'XDCC CANCEL')
      self.emit('download-err', err, fileInfo)
    })
  }

  private passiveToFile(
    file: fs.WriteStream,
    fileInfo: FileInfo,
    timeout: NodeJS.Timeout,
    nick: string
  ): void {
    fileInfo.position = fileInfo.position ? fileInfo.position : 0
    const bar = this.setupProgressBar(fileInfo.length - fileInfo.position)
    const self = this
    let received = 0
    const sendBuffer = Buffer.alloc(4)
    const available = this.passivePort.filter(port =>
      this.portInUse.includes(port)
    )
    const pick = available[Math.floor(Math.random() * available.length)]
    const server = net.createServer(client => {
      this.emit('download-start', fileInfo)
      client.on('data', data => {
        clearTimeout(timeout)
        file.write(data)
        received += data.length
        sendBuffer.writeUInt32BE(received, 0)
        client.write(sendBuffer)
        self.emit('downloading', received, fileInfo)
        timeout = this.setupTimeout(
          [true, nick],
          {
            eventname: 'download-err',
            message: ``,
            padding: 6,
            fileInfo: fileInfo,
            bar: bar,
          },
          1000 * 2,
          () => {
            server.close(() => {
              this.portInUse = this.portInUse.filter(p => p !== pick)
            })
          }
        )
        if (this.verbose) {
          bar.tick(data.length)
        }
      })
      client.on('end', () => {
        file.end()
        clearTimeout(timeout)
        server.close(() => {
          this.portInUse.push(pick)
          if (this.verbose) {
            console.error(
              `\u2937`.padStart(8),
              `${colors.bold(colors.green('\u2713'))} done: \x1b[36m${
                file.path
              }\x1b[0m`
            )
          }
          self.emit('downloaded', fileInfo)
        })
      })
      client.on('error', err => {
        clearTimeout(timeout)
        file.end()
        server.close(() => {
          this.portInUse.push(pick)
          this.say(nick, 'XDCC CANCEL')
          self.emit('download-err', err, fileInfo)
          if (this.verbose) {
            bar.interrupt(
              `\u2937`.padStart(6) +
                ` ${colors.bold(colors.red('\u0058'))} ` +
                err.message
            )
          }
        })
      })
    })
    if (pick) {
      this.portInUse.push(pick)
      server.listen(pick, '0.0.0.0')
    } else {
      this.say(nick, 'XDCC CANCEL')
      const err = new Error('All passive ports are currently used')
      self.emit('download-err', err, fileInfo)
      if (this.verbose) {
        console.error(
          `\u2937`.padStart(6),
          `${colors.bold(
            colors.red('\u0058')
          )} all passive ports are currently used: ${colors.yellow(
            `${fileInfo.ip}:${fileInfo.port}`
          )}`
        )
      }
    }
    server.on('listening', () => {
      this.raw(
        `PRIVMSG ${nick} ${String.fromCharCode(1)}DCC SEND ${fileInfo.file} ${
          this.ip
        } ${pick} ${fileInfo.length} ${fileInfo.token}${String.fromCharCode(1)}`
      )

      if (this.verbose) {
        console.error(
          `\u2937`.padStart(6),
          `${colors.bold(
            colors.cyan('\u2139')
          )} waiting for connexion at: ${colors.yellow(
            `${this.uint32ToIP(this.ip)}:${pick}`
          )}`
        )
      }
    })
    server.on('error', err => {
      file.end()
      server.close(() => {
        this.portInUse.push(pick)
        this.say(nick, 'XDCC CANCEL')
        self.emit('download-err', err, fileInfo)
        if (this.verbose) {
          console.error(
            `\u2937`.padStart(6),
            `${colors.bold(
              colors.red('\u0058')
            )} couldn't setup a passive transfert: ${colors.yellow(
              err.message
            )}`
          )
        }
      })
    })
  }
  /**
   * Method used to download a single packet.<br/><br/>
   * @param target Bot's nickname
   * @param packet Packet
   * @remark Fires either download or pipe events depending on {@link Params.path}'s value
   * @fires {@link download-err| Download Events}
   * @fires {@link pipe-data| Pipe Events}
   * @see {@link Params.path}
   * @example saving file on disk
   * ```javascript
   * const params = {
   *  host: 'irc.server.net',
   *  path: '/home/user/downloads'
   * }
   *
   * const xdccJS = new XDCC(params)
   *
   * xdccJS.on('xdcc-ready', () => {
   *   xdccJS.download('XDCC|Bot', 152)
   * })
   *
   * xdccJS.on('download-err', (err, fileInfo) => {
   *  console.error(err)
   * })
   *
   * xdccJS.on('downloaded', (fileInfo) => {
   *  console.log(fileInfo.filePath) //=> "/home/user/downloads/myfile.pdf"
   * })
   *
   * ```
   * @example how to use pipes
   * ```javascript
   * // example with express
   * const params = {
   *  host: 'irc.server.net',
   *  path: false // important!
   * }
   *
   * const xdccJS = new XDCC(params)
   *
   * xdccJS.on('xdcc-ready', () => {
   * 	app.listen(3000)
   * 	app.get('/download', (req, res) => {
   * 		// start a download eg: http://hostname:3000/download?bot=XDCCBOT&pack=32
   *		xdccJS.download(req.query.bot, req.query.pack)
   *		xdccJS.on('pipe-start', (fileInfo) => {
   * 		// set the filename and avoid browser directly playing the file.
   *     	res.set('Content-Disposition', `attachment;filename=${fileInfo.file}`)
   * 		// set the size so browsers know completion%
   *     	res.set('Content-Length', fileInfo.length)
   *     	res.set('Content-Type', 'application/octet-stream')
   * 		xdccJS.on('pipe-data', (data) => {
   * 			res.write(data)
   * 		})
   * 		xdccJS.on('pipe-downloaded', () => {
   * 			res.end()
   * 		})
   * 	})
   * })
   */
  public download(target: string, packet: string | number): void {
    packet = this.checkHashtag(packet, false)
    this.emit('request', {
      target,
      packet,
    })
  }
  /**
   * Method used to download multiple packets
   * @param target Bot's nickname
   * @param packets Packets
   * @remark Fires either download or pipe events depending on {@link path}'s value
   * @fires {@link download-err| Download Events}
   * @fires {@link pipe-data| Pipe Events}
   * @fire {@link batch-complete}
   * @see {@link path}
   * @example
   * ```javascript
   * xdccJS.downloadBatch('XDCC|Bot', '1-10, 25-27, 30')
   * // accepts array of numbers too, (strings are converted to number)
   * xdccJS.downloadBatch('XDCC|Bot', [1, 2, 3, '24', 32, 33, 35])
   * ```
   */
  public downloadBatch(
    target: string,
    packets: string | number[] | string[]
  ): void {
    const range: number[] = []
    if (typeof packets === 'string') {
      const packet = packets.split(',')
      for (const s of packet) {
        const minmax = s.split('-')
        if (s.includes('-')) {
          for (let i = +minmax[0]; i <= +minmax[1]; i++) {
            range.push(i)
          }
        } else {
          range.push(parseInt(s))
        }
      }
    } else {
      if (Array.isArray(packets)) {
        for (const pack of packets) {
          if (typeof pack === 'number') {
            range.push(pack)
          } else {
            range.push(parseInt(pack))
          }
        }
      }
    }

    if (this.verbose) {
      console.error(
        `\u2937`.padStart(4),
        `${colors.bold(
          colors.cyan('\u2139')
        )} batch download of packets: \x1b[33m${packets}\x1b[0m`
      )
    }
    this.emit('request-batch', {
      target: target,
      packet: range,
    })
  }

  private nickRandomizer(nick: string): string {
    if (nick.length > 6) {
      nick = nick.substr(0, 6)
    }
    return nick + Math.floor(Math.random() * 999) + 1
  }

  private formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  private checkHashtag(value: string | number, isChannel: boolean): string {
    if (isChannel) {
      if (typeof value === 'string') {
        if (value.charAt(0) === '#') {
          return value
        } else {
          return `#${value}`
        }
      } else if (typeof value === 'number') {
        return value.toString()
      } else {
        throw TypeError(
          `unexpected type of 'chan': a string|number was expected but got '${typeof value}'`
        )
      }
    } else {
      if (typeof value === 'number') {
        if (value % 1 === 0) {
          return `#${value.toString()}`
        } else {
          throw TypeError(`unexpected 'package': number must be an integer'`)
        }
      } else if (typeof value === 'string') {
        const isPack = RegExp(/^\d+-\d+$|^#\d+-\d+$|^\d+$|^#\d+$/gm).test(value)
        if (isPack) {
          return value
        } else {
          throw new TypeError(
            `unexpected 'package': string must be '100' or '#100' or '100-102' or '#102-102'`
          )
        }
      } else {
        throw new TypeError(
          `unexpected type of 'package': a string|number was expected but got ${typeof value}`
        )
      }
    }
  }

  private uint32ToIP(n: number): string {
    const byte1 = n & 255,
      byte2 = (n >> 8) & 255,
      byte3 = (n >> 16) & 255,
      byte4 = (n >> 24) & 255
    return byte4 + '.' + byte3 + '.' + byte2 + '.' + byte1
  }

  private parseCtcp(text: string, nick: string): FileInfo | void {
    const parts = text.match(/(?:[^\s"]+|"[^"]*")+/g)
    if (parts === null) {
      throw new TypeError(`CTCP : received unexpected msg : ${text}`)
    }
    if (parts[1] === 'SEND') {
      return {
        type: `${parts[0]} ${parts[1]}`,
        file: parts[2].replace(/"/g, ''),
        filePath: this.path
          ? path.normalize(this.path + '/' + parts[2].replace(/"/g, ''))
          : 'pipe',
        ip: this.uint32ToIP(parseInt(parts[3], 10)),
        port: parseInt(parts[4], 10),
        length: parseInt(parts[5], 10),
        token: parseInt(parts[6], 10),
      }
    } else if (parts[1] === 'ACCEPT') {
      const resume = this.resumequeue.filter(q => q.nick == nick)
      this.resumequeue = this.resumequeue.filter(q => q.nick !== nick)
      return {
        type: `${parts[0]} ${parts[1]}`,
        file: parts[2].replace(/"/g, ''),
        filePath: path.normalize(this.path + '/' + parts[2].replace(/"/g, '')),
        ip: resume[0].ip,
        port: parseInt(parts[3], 10),
        length: resume[0].length,
        position: parseInt(parts[4], 10),
        token: resume[0].token,
      }
    }
  }
  private setupTimeout(
    xdccCancel: [boolean, string],
    errorInfo: {
      eventname: string
      message: string
      padding: number
      fileInfo?: FileInfo
      bar?: ProgressBar
    },
    timeout: number,
    exec?: Function
  ): NodeJS.Timeout {
    return setTimeout(() => {
      if (xdccCancel[0]) {
        this.say(xdccCancel[1], 'XDCC CANCEL')
      }
      if (exec) {
        exec()
      }
      const error = new Error(errorInfo.message)
      this.emit(errorInfo.eventname, error, errorInfo.fileInfo)
      if (this.verbose) {
        const msg =
          `\u2937 `.padStart(errorInfo.padding) +
          colors.bold(colors.red('\u0058 ')) +
          errorInfo.message
        if (errorInfo.bar) {
          errorInfo.bar.interrupt(msg)
        } else {
          console.error(msg)
        }
      }
    }, timeout)
  }
  private setupProgressBar(len: number): ProgressBar {
    return new ProgressBar(
      `\u2937`.padStart(6) +
        ` ${colors.bold(
          colors.green('\u2713')
        )} downloading [:bar] ETA: :eta @ :rate - :percent `,
      {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: len,
      }
    )
  }
  /**
   * Event triggered when xdccJS is ready to download
   * @event xdcc-ready
   * @example
   * ```js
   * xdccJS.on('xdcc-ready', () => {
   *  xdccJS.download('XDCC|BOT', 23)
   * })
   * ```
   */
  static EVENT_XDCC_READY: () => void
  /**
   * Event triggered when a download starts.
   * @category Download
   * @event download-start
   * @example
   * ```js
   * xdccJS.on('download-start', (f) => {
   *   console.log(`Starting download of ${f.file}`)
   * })
   * ```
   */
  static EVENT_XDCC_START: (f: FileInfo) => void
  /**
   * Event triggered when chunks of data are being received
   * @category Download
   * @event downloading
   * @example
   * ```js
   * xdccJS.on('downloading', (r, f) => {
   *   console.log(`${f.file} - ${r}/${FileInfo.length} Bytes`)
   * })
   */
  static EVENT_XDCC_WHILE: (r: received, f: FileInfo) => void
  /**
   * Event triggered when a download fails.
   * @category Download
   * @event download-err
   * @example
   * ```js
   * xdccJS.on('download-err', (e, f) => {
   *   console.log(`failed to download ${f.file}`)
   *   console.error(e)
   * })
   * ```
   */
  static EVENT_XDCC_ERR: (e: Error, f: FileInfo) => void
  /**
   * Event triggered when a download is completed.
   * @category Download
   * @event downloaded
   * @example
   * ```js
   * xdccJS.on('downloaded', (f) => {
   *   console.log(`Download completed: ${f.filePath}`)
   * })
   * ```
   */
  static EVENT_XDCC_DONE: (f: FileInfo) => void
  /**
   * Event triggered when {@link downloadBatch} has completed all downloads
   * @event batch-complete
   * @example
   * ```js
   * xdccJS.on('xdcc-ready', () => {
   *  xdccJS.downloadBatch('XDCC|BOT', '23-25, 102, 300')
   * })
   *
   * xdccJS.on('batch-complete', (batchInfo) => {
   * 	console.log(batchInfo) //=> { target: 'XDCC|BOT', packet: [23, 24, 25, 102, 300] }
   * })
   * ```
   */
  static EVENT_XDCC_BATCH: (i: BatchInfo) => void
  /**
   * Event triggered when a pipable download starts. callback returns {@link FileInfo}
   * @category Pipe
   * @event pipe-start
   * @example
   * ```js
   * xdccJS.on('pipe-start', (f) => {
   *   console.log(`File length  : ${f.length}`)
   * })
   * ```
   */
  static EVENT_PIPE_START: (f: FileInfo) => void
  /**
   * Event triggered when receiving data from a piped download.
   * @category Pipe
   * @event pipe-data
   * @example
   * ```js
   * let stream = fs.createWriteStream( 'MyFile.mp4' )
   * xdccJS.on('pipe-data', (chunk, r) => {
   *   stream.write(chunk)
   *   console.log(`Downloaded ${stream.length} out of ${r}`)
   * })
   * ```
   */
  static EVENT_PIPE_DATA: (chunk: Buffer, r: received) => void
  /**
   * Event triggered when a piped download has failed. Callback returns Error and {@link FileInfo}
   * @category Pipe
   * @event pipe-err
   * @example
   * ```js
   * let file = fs.createWriteStream( 'MyFile.mp4' )
   * xdccJS.on('pipe-err', (e, f) => {
   *   file.end()
   *   console.log(`failed to download : ${f.file}`)
   *   console.error(e)
   * })
   * ```
   */
  static EVENT_PIPE_ERR: (e: Error, f: FileInfo) => void
  /**
   * Event triggered when a pipable download is done. Callback returns {@link FileInfo}
   * @category Pipe
   * @event pipe-downloaded
   * @example
   * ```js
   * let file = fs.createWriteStream( 'MyFile.mp4' )
   * xdccJS.on('pipe-downloaded', (f) => {
   *   file.end()
   * })
   * ```
   */
  static EVENT_PIPE_DONE: (f: FileInfo) => void
}

/**
 * Parameters for {@link XDCC.constructor}
 * @asMemberOf XDCC
 */
declare interface Params {
  /** IRC server hostname */
  host: string
  /** IRC server PORT, default : 6667*/
  port?: number
  /** Nickname to use on IRC, default: 'xdccJS' + random number */
  nick?: string
  /**
   * Channel(s) to join
   * @example
   * ```js
   * params.chan = '#yay'
   * // or
   * params.chan = ['#yay', '#nay']
   * ```
   */
  chan?: string | string[]
  /**
   * Download path (absolute or relative)
   * @remark can be set to false to use pipes
   * @see {@link XDCC.download} for example on how to use pipes.
   * */
  path?: false | string
  /** Display information regarding your download in console, default : false */
  verbose?: boolean
  /** Add Random number to nickname, default: false */
  randomizeNick?: boolean
  /** Port(s) for passive DCC, default : [5001] */
  passivePort?: number[]
}

/**
 * File informations
 * @asMemberOf XDCC
 */
declare interface FileInfo {
  /** Type of transfert (send or resume) */
  type: string
  /** Filename */
  file: string
  /** Filename with absolute path */
  filePath: string
  /** Transfert IP */
  ip: string
  /** Transfert PORT  */
  port: number
  /** File length in bytes */
  length: number
  /** Token (passive DCC) */
  token: number
  /** Resume Position */
  position?: number
}

/**
 * Batch information
 * @asMemberOf XDCC
 */
declare interface BatchInfo {
  /** Bot username */
  target: string
  /** Array containing requested packs */
  packet: number[]
}
/**
 * Accumulated lenght of data received*
 * @asMemberOf XDCC
 */
declare type received = number
