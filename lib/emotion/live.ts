export interface LiveEmotion {
  buildUp: number;
  anticipation: number;
  release: number;
  driver: string;
}

const BUILD = ['羞辱', '重伤', '背叛', '无计可施', '颤抖', '咬牙', '忍让', '危机', '追兵', '绝境', '卑微', '压抑', '受辱', '欺压', '退无可退'];
const ANT = ['却', '难道', '竟', '忽然', '底牌', '秘密', '陷阱', '来了', '准备', '计划', '破绽', '转机', '暗处', '幕后'];
const REL = ['反杀', '揭穿', '身份曝光', '恢复', '突破', '胜利', '冷笑', '秒杀', '碾压', '打脸', '爽', '翻盘', '复仇', '亮出底牌', '降维打击'];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function countHits(text: string, words: string[]): number {
  return words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
}

export function estimateLiveEmotion(text: string): LiveEmotion {
  const windowText = text.slice(-1500);
  const b = countHits(windowText, BUILD);
  const a = countHits(windowText, ANT);
  const r = countHits(windowText, REL) * 1.4 + (windowText.match(/[！？!?]/g)?.length ?? 0) * 0.15;
  const buildUp = Math.round(Math.tanh(b / 2.5) * 10);
  const anticipation = Math.round(Math.tanh(a / 3.5) * 10);
  const release = Math.round(Math.tanh(r / 2.2) * 10);
  const scores: Array<[number, string]> = [[buildUp, '压抑累积'], [anticipation, '期待蓄力'], [release, '爽点释放']];
  scores.sort((x, y) => y[0] - x[0]);
  const maxScore = scores[0][0];
  const driver = maxScore >= 5 ? scores[0][1] + (maxScore >= 8 ? '（强烈）' : '') : '平稳推进';
  return { buildUp, anticipation, release, driver };
}
