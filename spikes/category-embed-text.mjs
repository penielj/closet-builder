// Spike 0.3: precomputes normalized CLIP text embeddings for the category prompts, so the
// phone only needs the vision model. Output: text-embeds.json { [modelId]: [{ category, label, embedding }] },
// copied to public/spike/. Run with Node from a folder with @huggingface/transformers@4.3.1
// installed (not a project dependency); it downloads both text models (~420MB) once.
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers'
import { writeFileSync } from 'node:fs'

const PROMPTS = {
  top: ['t-shirt', 'shirt', 'blouse', 'sweater', 'hoodie', 'tank top', 'polo shirt', 'cardigan'],
  bottom: ['pair of pants', 'pair of jeans', 'pair of shorts', 'skirt', 'pair of leggings', 'pair of trousers'],
  dress: ['dress', 'jumpsuit'],
  shoes: ['pair of shoes', 'pair of sneakers', 'pair of boots', 'pair of sandals', 'pair of heels'],
  outerwear: ['jacket', 'coat', 'raincoat', 'puffer jacket', 'blazer'],
}
const MODELS = ['Xenova/mobileclip_s0', 'Xenova/clip-vit-base-patch32']

const out = {}
for (const id of MODELS) {
  const tokenizer = await AutoTokenizer.from_pretrained(id)
  const model = await CLIPTextModelWithProjection.from_pretrained(id, { dtype: 'fp32' })
  const rows = Object.entries(PROMPTS).flatMap(([category, labels]) => labels.map((label) => ({ category, label })))
  const inputs = tokenizer(rows.map((r) => `a photo of a ${r.label}.`), { padding: 'max_length', truncation: true })
  const { text_embeds } = await model(inputs)
  const vectors = text_embeds.normalize(2, -1).tolist()
  out[id] = rows.map((r, n) => ({ ...r, embedding: vectors[n].map((v) => Number(v.toFixed(6))) }))
  console.log(id, rows.length, 'prompts,', vectors[0].length, 'dims')
}
writeFileSync('text-embeds.json', JSON.stringify(out))
