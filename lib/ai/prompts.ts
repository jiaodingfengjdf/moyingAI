export const SYSTEM_PROMPT = [
  '你是资深网络文学作者助理，负责在长篇连载中协助续写与润色。',
  '铁律：',
  '1. 严格遵循世界观设定与人物当前状态，绝不与设定冲突；',
  '2. 不重复已有原文内容，从断点自然衔接；',
  '3. 只输出正文，不输出解释、标注或引导语；',
  '4. 保持与原文一致的叙述视角、文风与语气；',
  '5. 不引入未经设定的新角色、新设定或越级战力。',
].join('\n');

export interface GhostBranchSpec {
  id: string;
  label: string;
  instruction: string;
}

export const GHOST_BRANCHES: GhostBranchSpec[] = [
  { id: 'action', label: '推进动作', instruction: '续写 100~300 字：推动剧情动作向前发展，落到具体行为与冲突升级，结尾留一个小钩子。' },
  { id: 'psyche', label: '心理剖析', instruction: '续写 100~300 字：聚焦当前视角人物的内心活动、欲望与恐惧，强化代入感。' },
  { id: 'environment', label: '环境渲染/变故突生', instruction: '续写 100~300 字：用环境、氛围或一个突发变数推进场景，制造张力。' },
];

export type RewriteMode = 'expand' | 'senses' | 'pace' | 'mood' | 'fix' | 'visual' | 'sound' | 'smell' | 'touch' | 'pain';

export const SENSE_MODES: RewriteMode[] = ['visual', 'sound', 'smell', 'touch', 'pain'];

export const REWRITE_MODES: Record<RewriteMode, { label: string; instruction: string }> = {
  expand: { label: '扩写', instruction: '在不改变情节与设定的前提下扩写给定片段，篇幅扩充约 1.5~2 倍，补充动作细节、对话反应与场景信息。' },
  senses: { label: '五感强化', instruction: '重写给定片段，强化视觉光影、声音质感、气味、触觉与痛觉等五感描写，保持情节不变。' },
  pace: { label: '节奏加速', instruction: '重写给定片段，剔除冗余修饰、压缩长句、强化动作动词，使节奏更快更利落。' },
  mood: { label: '意境沉浸', instruction: '重写给定片段，增加隐喻与场景氛围烘托，营造更浓的意境与情绪。' },
  fix: {
    label: '一致性修复',
    instruction: '重写给定片段，修复其中与世界观设定、人物状态或前文事实不一致之处；保持情节走向、叙述视角与文风，不引入未经设定的新内容。',
  },
  visual: { label: '视觉强化', instruction: '重写给定片段，只强化视觉描写：光影、色彩、构图、视线与画面层次；不增加声音、气味等其他感官信息。' },
  sound: { label: '声音强化', instruction: '重写给定片段，只强化声音描写：环境音、对话质感、响度层次与静默对比；不增加视觉等冗余信息。' },
  smell: { label: '气味强化', instruction: '重写给定片段，只强化气味与嗅觉联想：场景气味、人物气息、气味触发记忆；保持情节不变。' },
  touch: { label: '触觉强化', instruction: '重写给定片段，只强化触觉描写：温度、质地、压力、衣料与皮肤接触；不堆砌无意义的其他感官词。' },
  pain: { label: '痛觉强化', instruction: '重写给定片段，只强化痛觉与身体代价：受伤时的部位、程度、生理反应与忍痛细节；不夸张超出设定承受力。' },
};
