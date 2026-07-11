import express from 'express';
import * as lamejs from '@breezystack/lamejs';

const app = express();
app.use(express.json());

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

app.post('/tts', rateLimit, async (req, res) => {
  try {
    const { apiKey, texto, voice = 'Kore' } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'Campo "apiKey" é obrigatório' });
    if (!texto) return res.status(400).json({ error: 'Campo "texto" é obrigatório' });

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

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`tts-service rodando na porta ${PORT}`));
