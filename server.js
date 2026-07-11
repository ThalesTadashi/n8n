import express from 'express';
import * as lamejs from '@breezystack/lamejs';
import puppeteer from 'puppeteer-core';

const app = express();
app.use(express.json({ limit: '5mb' }));

// Captura erro de JSON malformado no body e devolve resposta limpa
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição', detalhe: err.message });
  }
  next(err);
});

const PORT = process.env.PORT || 3000;
const LIMITE_REQ = 5;
const JANELA_MS = 60 * 1000; // 1 minuto

// Rate limit simples em memória: ip -> { count, resetAt }
const contadorIp = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const agora = Date.now();
  const registro = contadorIp.get(ip);
  if (!registro || agora > registro.resetAt) {
    contadorIp.set(ip, { count: 1, resetAt: agora + JANELA_MS });
    return next();
  }
  if (registro.count >= LIMITE_REQ) {
    const restante = Math.ceil((registro.resetAt - agora) / 1000);
    return res.status(429).json({ error: `Limite de requisições excedido. Tente em ${restante}s.` });
  }
  registro.count += 1;
  next();
}

// Template HTML fixo, com placeholders substituídos por request
const TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feedback de Pronúncia com Personagem</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #F9E241 0%, #A33DE4 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 0;
            background-repeat: no-repeat;
            background-attachment: fixed;
        }
        .screen-container {
            width: 100%;
            max-width: 450px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 20px 0px 20px;
            z-index: 3;
        }
        .feedback-badge {
            background-color: white;
            padding: 8px 16px;
            border-radius: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
            color: #2D2738;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .feedback-badge::before {
            content: "";
            display: inline-block;
            width: 10px;
            height: 10px;
            background-color: #4A90E2;
            border-radius: 50%;
        }
        .hero-title {
            padding: 18px 24px 40px 24px;
            color: #FFFFFF;
            z-index: 2;
        }
        .hero-title h1 {
            font-size: 34px;
            font-weight: 700;
            line-height: 1.2;
        }
        .hero-title h1 span {
            color: #2D1152;
        }
        .hero-title p {
            font-size: 28px;
            font-weight: 700;
            margin-top: 4px;
        }
        .main-card {
            background-color: #FFFFFF;
            border-top-left-radius: 32px;
            border-top-right-radius: 32px;
            flex-grow: 1;
            padding: 28px 24px 32px 24px;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.06);
            z-index: 1;
            position: relative;
        }
        .pronuncia-row {
            position: relative;
        }
        .character-img {
            float: left;
            width: 150px;
            height: auto;
            margin-top: 0;
            margin-left: -16px;
            margin-right: 8px;
            margin-bottom: 4px;
            shape-outside: url('person-fame.png');
            shape-image-threshold: 0.5;
            shape-margin: 6px;
        }
        .pronuncia-content {
            overflow: hidden;
        }
        .section-block {
            margin-bottom: 32px;
        }
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .section-title {
            font-size: 22px;
            font-weight: 700;
            color: #2D1152;
        }
        .score-pill {
            background-color: #E2F5E7;
            color: #1B7235;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }
        .score-pill::before {
            content: "✓";
            font-weight: 900;
        }
        .text-content {
            font-size: 17px;
            line-height: 1.6;
            color: #1A1A1A;
            font-weight: 400;
            letter-spacing: -0.1px;
        }
        .word-wrong {
            color: #D93025;
            font-weight: 600;
        }
    </style>
</head>
<body>

    <div class="screen-container">
        <div class="top-bar">
            <div class="feedback-badge">Feedback</div>
        </div>

        <div class="hero-title">
            <h1>Wow,</h1>
            <p>You're on fire! 🔥</p>
        </div>

        <div class="main-card">
            <div class="pronuncia-row">
                <div class="pronuncia-content">

                    <img class="character-img" src="{{PERSONAGEM}}" alt="Personagem">

                    <div class="section-block">
                        <div class="section-header">
                            <div class="section-title">Pronúncia</div>
                            <div class="score-pill">{{PORCENTAGEM}}/100</div>
                        </div>
                        <div class="text-content">{{TEXTO_ERROS}}</div>
                    </div>

                    <div class="section-block">
                        <div class="section-header">
                            <div class="section-title">Como melhorar</div>
                            <div class="score-pill">100/100</div>
                        </div>
                        <div class="text-content">{{TEXTO_CORRETO}}</div>
                    </div>

                </div>
            </div>
        </div>
    </div>

</body>
</html>`;

// Browser Puppeteer compartilhado entre requisições
let browserPromise = puppeteer.launch({
  headless: 'new',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

function pcmParaMp3(pcmBuffer, sampleRate = 24000, channels = 1) {
  const samples = new Int16Array(
    pcmBuffer.buffer,
    pcmBuffer.byteOffset,
    pcmBuffer.length / 2
  );
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
  const blockSize = 1152;
  const chunks = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const bloco = samples.subarray(i, i + blockSize);
    const buf = encoder.encodeBuffer(bloco);
    if (buf.length > 0) chunks.push(Buffer.from(buf));
  }
  const fim = encoder.flush();
  if (fim.length > 0) chunks.push(Buffer.from(fim));
  return Buffer.concat(chunks);
}

function sanitizarTexto(texto) {
  return texto
    // remove emojis e símbolos pictográficos
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    // remove barras (mantém apóstrofos e acentos)
    .replace(/[\/\\]/g, '')
    // quebras de linha e tabs viram espaço
    .replace(/[\n\r\t]+/g, ' ')
    // colapsa espaços múltiplos
    .replace(/\s+/g, ' ')
    .trim();
}

app.post('/tts', rateLimit, async (req, res) => {
  try {
    const { apiKey, texto: textoBruto, voice = 'Kore' } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'Campo "apiKey" é obrigatório' });
    if (!textoBruto) return res.status(400).json({ error: 'Campo "texto" é obrigatório' });
    const texto = sanitizarTexto(textoBruto);
    if (!texto) return res.status(400).json({ error: 'Texto vazio após sanitização' });

    const orResponse = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-tts-preview',
        input: texto,
        voice,
        response_format: 'pcm',
      }),
    });

    if (!orResponse.ok) {
      const erro = await orResponse.text();
      return res.status(orResponse.status).json({ error: erro });
    }

    const pcmBuffer = Buffer.from(await orResponse.arrayBuffer());
    const mp3Buffer = pcmParaMp3(pcmBuffer);
    res.set('Content-Type', 'audio/mpeg');
    res.send(mp3Buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/render', rateLimit, async (req, res) => {
  const {
    personagem,
    porcentagem,
    texto_erros,
    texto_correto,
    width = 450,
    height = 800,
    fullPage = true
  } = req.body;

  if (!personagem) return res.status(400).json({ error: 'Campo "personagem" é obrigatório' });
  if (porcentagem === undefined) return res.status(400).json({ error: 'Campo "porcentagem" é obrigatório' });
  if (!texto_erros) return res.status(400).json({ error: 'Campo "texto_erros" é obrigatório' });
  if (!texto_correto) return res.status(400).json({ error: 'Campo "texto_correto" é obrigatório' });

  const html = TEMPLATE_HTML
    .replaceAll('{{PERSONAGEM}}', personagem)
    .replaceAll('{{PORCENTAGEM}}', porcentagem)
    .replaceAll('{{TEXTO_ERROS}}', texto_erros)
    .replaceAll('{{TEXTO_CORRETO}}', texto_correto);

  let page;
  try {
    const browser = await browserPromise;
    page = await browser.newPage();
    await page.setViewport({ width: Number(width), height: Number(height) });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const buffer = await page.screenshot({ type: 'png', fullPage });

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close();
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`tts-service rodando na porta ${PORT}`));
