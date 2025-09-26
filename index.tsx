/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() private currentStage = 0;
  @state() private isLoggedIn = false;
  @state() private userName = '';
  @state() private language = 'te-IN';
  @state() private aiState: 'idle' | 'listening' | 'thinking' | 'talking' =
    'idle';

  private stages = [
    'Introduction',
    'Payment Options',
    'NBFC Loan Details',
    'KYC & Documentation',
    'Final Steps & Closing',
  ];

  // =================================================================
  // THIS IS WHERE YOU WILL INSERT YOUR STAGE-WISE SYSTEM PROMPTS
  // =================================================================
  private stagePrompts = [
    // Stage 1: Introduction (Tenglish)
    `Nuvvu NxtWave kosam oka friendly and professional AI assistant. User ki valla pilla vaadi learning journey lo next steps gurinchi guide cheyyali. Nee tone encouraging and clear ga undali.
    **Current Task:** User ni welcome chesi call context set cheyyi.
    1. User ni warm ga greet cheyyi (e.g., "Namaste! NxtWave ki swagatham.").
    2. Ninnu nuvvu introduce chesko: "Nenu mee AI assistant, meeku guide cheyyadaniki unnanu..."
    3. Process ni explain cheyyi: "Ee process ki 10-15 nimishalu padutundi, okasari complete ayyaka, learning portal ki full access vastundi."
    4. Importance ni frame cheyyi: "Program activate cheyyadaniki idi chala crucial step, so delays lekunda ippude complete cheddam."
    5. Rapport and motivation build cheyyi: "Seat reserve cheskunnanduku congratulations! Idi mee pilla vaadi future meeda mee commitment ni chupistundi."
    6. Program value ni gurtu cheyyi: NxtWave's focus on practical, real-world skills in 6 growth cycles gurinchi and students ela high salaries aim cheyyagalaro cheppu.
    Ee points cover chesaka, user respond ayye varaku wait cheyyi.`,

    // Stage 2: Payment Options (Tenglish)
    `Nuvvu NxtWave kosam oka helpful AI assistant.
    **Current Task:** User ki payment options clear ga explain cheyyi.
    1. Options ni simple ga cheppu: "Meeru program fee ni konni vidhaluga complete cheyyochu: One-time payment, No-Cost EMI tho Digital Loan, or Credit card."
    2. User EMI gurinchi adigina leda select cheskunte, ee recommendation ivvu: "Memu 24-month EMI ni recommend chestunnam—idi monthly payments ni comfortable ga unchutundi and course twaraga complete avvadaniki help chestundi."
    User questions or decision kosam wait cheyyi.`,

    // Stage 3: NBFC Loan Details (Tenglish)
    `Nuvvu NxtWave kosam oka reassuring AI assistant.
    **Current Task:** User EMI loan tho proceed avtunte, NBFC and Loan Journey gurinchi explain cheyyi.
    1. Partnership gurinchi explain cheyyi: "Education andarki andubtulo unchalani, memu Varthana, Bajaj, Feemonk, Shopse, and Gyaandhan lanti RBI-registered NBFCs tho partner ayyam."
    2. Assurance ivvu: "Ee process 100% digital, safe, and deeniki collateral avasaram ledu. Meeru course fee ni easy installments lo matrame pay chestaru."
    Valla confirmation or questions kosam wait chesi proceed avvu.`,

    // Stage 4: KYC & Documentation (Tenglish)
    `Nuvvu NxtWave kosam oka clear and instructional AI assistant.
    **Current Task:** Loan approval requirements and digital process gurinchi explain cheyyi.
    1.  **Co-Applicant gurinchi explain cheyyi:** "Loan approval kosam, manaki oka Right Co-Applicant kavali—stable monthly income and active bank account unna vallu."
    2.  **Documents list cheyyi:** "Co-applicant kosam ee documents ready ga unchukondi: PAN card, Aadhaar card (front & back), Bank proof ante passbook or statement, oka clear photo, and oka 15-second confirmation video."
    3.  **Financial Checks gurinchi mention cheyyi:** "Manaki valla CIBIL score and income proof kuda kavali. Meeru OneScore or PaisaBazaar lanti websites lo score ni twaraga check cheskovachu."
    4.  **3-Step Process ni outline cheyyi:** "Digital loan process chala simple: First, meeru portal lo KYC documents submit chestaru. Second, NBFC vallu details verify cheyyadaniki call chestaru. Third, meeru digital agreement kosam E-sign and E-mandate complete chestaru."
    5.  **Outcome ni cheppu:** "Idi ayipoyaka, mee pilla vaadi seat 100% confirm avtundi, and onboarding ventane start cheyyochu."`,

    // Stage 5: Final Steps & Closing (Tenglish)
    `Nuvvu NxtWave kosam oka motivating AI assistant.
    **Current Task:** Conversation ni oka strong, reassuring call to action tho close cheyyi.
    1.  **Urgency create cheyyi:** "Program start cheyyadam lo delays avoid cheyyadaniki, ippude KYC and document upload complete cheddam. Deeniki 10-15 nimishale padutundi and mee pilla vaadiki learning portal ki uninterrupted access vastundani ensure chestundi."
    2.  **Direct Call to Action:** Clear ga adugu, "Manam ventane KYC submission start cheddama?"
    3.  **Assurance tho end cheyyi:** "Antha fully digital, safe, and convenient—physical visits emi avasaram ledu. Idi complete ayye varaku nenu meeku step by step guide chestanu. Let's get started."`,
  ];

  private client: GoogleGenAI;
  // FIX: Use a session promise to manage the live session, preventing race conditions.
  private sessionPromise: Promise<Session>;
  // FIX: Cast window to `any` to access vendor-prefixed `webkitAudioContext` without TypeScript errors.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: sans-serif;
      padding: 0 20px;
      transition: color 0.3s ease;
    }

    #status.error {
      color: #ff8a80; /* A clearer red for error messages */
      font-weight: 500;
    }

    .stepper {
      position: absolute;
      top: 5vh;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      width: 90%;
      max-width: 800px;
      z-index: 10;
      color: white;
      font-family: sans-serif;
    }
    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: 100px;
      text-align: center;
      opacity: 0.5;
      transition: opacity 0.3s ease;
    }
    .step.active,
    .step.completed {
      opacity: 1;
    }
    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      transition: all 0.3s ease;
    }
    .step.active .step-number {
      background-color: white;
      color: #100c14; /* background color */
      transform: scale(1.1);
    }
    .step.completed .step-number {
      background-color: #4caf50;
      border-color: #4caf50;
      color: white;
    }
    .step-name {
      font-size: 13px;
      font-weight: 500;
    }
    .step-connector {
      flex: 1;
      height: 2px;
      background: white;
      margin-top: 16px;
      opacity: 0.5;
      transition: all 0.3s ease;
    }
    .step-connector.completed {
      background: #4caf50;
      opacity: 1;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: row;
      gap: 20px;
    }
    .controls button {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      width: 64px;
      height: 64px;
      cursor: pointer;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .controls button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    #talkButton {
      width: 80px;
      height: 80px;
      transition: all 0.2s ease-in-out;
    }
    #talkButton.recording {
      background: rgba(200, 0, 0, 0.8);
      transform: scale(1.1);
      box-shadow: 0 0 20px rgba(200, 0, 0, 0.8);
    }

    #resetButton[disabled],
    #nextStageButton[disabled],
    #talkButton[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #resetButton[disabled]:hover,
    #nextStageButton[disabled]:hover,
    #talkButton[disabled]:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    #nextStageButton {
      width: auto;
      height: 48px;
      border-radius: 24px;
      padding: 0 24px;
      font-size: 16px;
    }

    #login-container {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      background: rgba(20, 16, 26, 0.7);
      padding: 40px;
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: white;
      font-family: sans-serif;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      text-align: center;
    }
    #login-container h2 {
      margin-top: 0;
      margin-bottom: 8px;
      font-size: 28px;
    }
    #login-container p {
      margin-top: 0;
      margin-bottom: 24px;
      opacity: 0.8;
    }
    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .form-group input,
    .form-group select {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 16px;
      box-sizing: border-box; /* Important for padding */
    }
    .form-group select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 1em;
      padding-right: 2.5em; /* Make space for arrow */
    }
    .form-group option {
      background: #100c14; /* Match background color */
      color: white;
    }
    #login-container button {
      width: 100%;
      padding: 14px;
      font-size: 18px;
      font-weight: bold;
      color: #100c14;
      background: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }
    #login-container button:hover {
      background: #dddddd;
    }
  `;

  constructor() {
    super();
    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });
    this.initAudio();
    this.outputNode.connect(this.outputAudioContext.destination);

    if (!navigator.onLine) {
      this.updateError('You are offline. Please check your internet connection.');
    }
    window.addEventListener('offline', () =>
      this.updateError('Connection lost. Please check your internet connection.'),
    );
    window.addEventListener('online', () => {
      this.updateStatus('You are back online.');
    });
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private initSession() {
    if (!navigator.onLine) {
      this.updateError('Cannot initialize session. You are offline.');
      return;
    }

    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    try {
      // FIX: Assign the promise to the class property to manage the session lifecycle correctly.
      this.sessionPromise = this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Connection established. Hold to talk.');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              if (this.sources.size === 0) {
                this.aiState = 'talking';
                this.updateStatus('Speaking...');
              }
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
                if (this.sources.size === 0) {
                  this.aiState = 'idle';
                  this.updateStatus('Hold to talk.');
                }
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            this.updateError(
              `A real-time connection error occurred. Please check your internet and try again.`,
            );
            this.stopRecording();
          },
          onclose: (e: CloseEvent) => {
            if (!e.wasClean) {
              this.updateError(
                `The connection was closed unexpectedly. Please refresh to start a new session.`,
              );
              this.stopRecording();
            } else {
              this.updateStatus('Connection closed.');
            }
          },
        },
        config: {
          systemInstruction: this.stagePrompts[this.currentStage],
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}},
            languageCode: this.language,
          },
        },
      });
    } catch (e) {
      console.error('Failed to initialize session:', e);
      let errorMessage =
        'Failed to connect to the service. Please refresh the page and try again.';
      if (e instanceof Error) {
        // The detailed error from the API will be in e.message, like 'Unsupported language...'
        errorMessage = `Session error: ${e.message}`;
      }
      this.updateError(errorMessage);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = '';
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = '';
    this.aiState = 'idle';
  }

  private async startRecording() {
    // Interrupt any currently playing audio from the AI
    if (this.sources.size > 0) {
      for (const source of this.sources.values()) {
        source.stop();
        this.sources.delete(source);
      }
      this.nextStartTime = 0;
    }

    if (!navigator.onLine) {
      this.updateError('Cannot start recording. You are offline.');
      return;
    }

    if (this.isRecording) {
      return;
    }

    this.error = ''; // Clear previous errors
    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);
        // FIX: Use the session promise to send data, preventing stale closures.
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({media: createBlob(pcmData)});
        });
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.aiState = 'listening';
      this.updateStatus('Listening...');
    } catch (err) {
      console.error('Error starting recording:', err);
      let errorMessage =
        'An unexpected error occurred while trying to start recording.';
      if (err instanceof Error) {
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          errorMessage =
            'Microphone access denied. Please allow microphone access in your browser settings to continue.';
        } else if (err.name === 'NotFoundError') {
          errorMessage =
            'No microphone found. Please connect a microphone and try again.';
        } else {
          errorMessage = `Could not start recording: ${err.message}`;
        }
      }
      this.updateError(errorMessage);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.isRecording = false;
    this.aiState = 'thinking';
    this.updateStatus('Thinking...');

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private handleTalkPress() {
    if (!this.isRecording) {
      this.startRecording();
    }
  }

  private handleTalkRelease() {
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  private nextStage() {
    if (this.currentStage < this.stages.length - 1) {
      const wasRecording = this.isRecording;

      // Stop the current recording if it's active
      if (wasRecording) {
        this.stopRecording();
      }

      // Clear previous error and move to the next stage
      this.error = '';
      this.currentStage += 1;
      this.updateStatus(
        `Transitioning to: ${this.stages[this.currentStage]}`,
      );

      // Close the old session and initialize a new one with the new system prompt
      // FIX: Use the session promise to safely close the connection.
      this.sessionPromise?.then((session) => session.close());
      this.initSession();
    }
  }

  private reset() {
    this.stopRecording();
    // FIX: Use the session promise to safely close the connection.
    this.sessionPromise?.then((session) => session.close());
    this.currentStage = 0;
    this.error = '';
    this.aiState = 'idle';
    this.initSession();
    this.updateStatus('Session cleared. Hold to talk.');
  }

  private handleLogin(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    this.userName = formData.get('name') as string;
    this.language = formData.get('language') as string;
    this.isLoggedIn = true;
    this.initSession();
  }

  private renderLogin() {
    return html`
      <div id="login-container">
        <form @submit=${this.handleLogin}>
          <h2>Welcome</h2>
          <p>Please enter your details to begin.</p>
          <div class="form-group">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" required />
          </div>
          <div class="form-group">
            <label for="language">Preferred Language</label>
            <select
              id="language"
              name="language"
              .value=${this.language}>
              <option value="te-IN">Telugu</option>
              <option value="en-US">English</option>
              <option value="hi-IN">Hindi</option>
            </select>
          </div>
          <button type="submit">Start Conversation</button>
        </form>
      </div>
    `;
  }

  private renderApp() {
    return html`
      <div class="stepper">
        ${this.stages.map(
          (stage, i) => html`
            <div
              class="step ${i === this.currentStage ? 'active' : ''} ${i <
              this.currentStage
                ? 'completed'
                : ''}">
              <div class="step-number">
                ${i < this.currentStage ? '✓' : i + 1}
              </div>
              <div class="step-name">${stage}</div>
            </div>
            ${i < this.stages.length - 1
              ? html`<div
                  class="step-connector ${i < this.currentStage
                    ? 'completed'
                    : ''}"></div>`
              : ''}
          `,
        )}
      </div>
      <div class="controls">
        <button
          id="resetButton"
          @click=${this.reset}
          ?disabled=${this.isRecording}
          aria-label="Reset Session">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="40px"
            viewBox="0 -960 960 960"
            width="40px"
            fill="#ffffff">
            <path
              d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
          </svg>
        </button>
        <button
          id="talkButton"
          class=${this.isRecording ? 'recording' : ''}
          @pointerdown=${this.handleTalkPress}
          @pointerup=${this.handleTalkRelease}
          @pointerleave=${this.handleTalkRelease}
          ?disabled=${!this.sessionPromise}
          aria-label="Hold to Talk">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="40px"
            viewBox="0 -960 960 960"
            width="40px"
            fill="#ffffff">
            <path
              d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm-40 280v-104q-82-14-131-81.5T260-400h-60q0 86 49.5 158T380-130v110h-80v-80h280v80h-80v-110q69-23 114.5-84.5T760-400h-60q0 82-49 149.5T520-184v104h-80Zm80-240q17 0 28.5-11.5T560-460v-240q0-17-11.5-28.5T520-740h-80q-17 0-28.5 11.5T400-700v240q0 17 11.5 28.5T440-420h80Z" />
          </svg>
        </button>
        <button
          id="nextStageButton"
          @click=${this.nextStage}
          ?disabled=${this.isRecording ||
          this.currentStage >= this.stages.length - 1}>
          Next Stage
        </button>
      </div>

      <div id="status" class=${this.error ? 'error' : ''} role="alert" aria-live="assertive">
        ${this.error || this.status}
      </div>
    `;
  }

  render() {
    return html`
      <div>
        ${this.isLoggedIn ? this.renderApp() : this.renderLogin()}
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}