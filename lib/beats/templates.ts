export interface Beat {
  title: string;
  goal: string;
  points?: string;
}

export interface SkeletonChapter {
  title: string;
  outline: string;
  beats: Beat[];
}

export interface SkeletonPayload {
  volumeOutline: string;
  chapters: SkeletonChapter[];
}

export interface BeatTemplate {
  id: string;
  name: string;
  description: string;
  volumeOutline: string;
  chapters: SkeletonChapter[];
}

export const BEAT_TEMPLATES: BeatTemplate[] = [
  {
    id: 'golden-three',
    name: '黄金三章',
    description: '快速建立代入感：主角陷入困境 → 金手指/转机 → 反击立威，三章内给出完整情绪闭环。',
    volumeOutline: '开篇三章：第一章以强冲突与身份代入开篇，第二章给出转机并升级危险，第三章完成首次反击立威并抛出长期目标。',
    chapters: [
      {
        title: '开局困境',
        outline: '用 1~2 个具体事件让读者记住主角的核心欲望与致命困境，章末抛出不可回避的威胁。',
        beats: [
          { title: '主角登场', goal: '展现身份、处境与核心欲望，制造第一个小冲突。', points: '动作开场，先演后述' },
          { title: '困境加码', goal: '威胁升级，主角退无可退。', points: '结尾钩子：限期/代价' },
        ],
      },
      {
        title: '转机与升级',
        outline: '金手指或外力转机出现，主角第一次使用新能力，随即遭遇更强对手。',
        beats: [
          { title: '获得转机', goal: '能力觉醒或贵人相助，给出代价与限制。' },
          { title: '初试锋芒', goal: '小胜建立读者信心，暴露新能力的边界。' },
          { title: '强敌登场', goal: '更高层对手出现，旧账新仇叠加。' },
        ],
      },
      {
        title: '反击立威',
        outline: '设计一场让读者憋屈后释放的打脸/翻盘，收回第一章钩子并展开全书目标。',
        beats: [
          { title: '冲突引爆', goal: '对手当众羞辱或下死手，情绪压制到最高点。' },
          { title: '绝地反杀', goal: '主角以出人意料的方式取胜，爽点释放。' },
          { title: '长线目标', goal: '胜利带来新身份与更大任务，转入主线。' },
        ],
      },
    ],
  },
  {
    id: 'face-slap',
    name: '打脸逆袭循环',
    description: '标准的「压 → 蓄 → 打」循环模板，适用于都市/玄幻升级剧情。',
    volumeOutline: '一个完整的打脸循环：铺垫受辱、暗中蓄力、当众反杀，并让打脸结果推动下一阶段矛盾。',
    chapters: [
      {
        title: '受辱铺垫',
        outline: '对手基于信息差当众贬低/打压主角，埋下反转依据。',
        beats: [
          { title: '轻视与侮辱', goal: '让读者与主角一起憋屈。' },
          { title: '信息差埋点', goal: '安排只有主角知道的反转筹码。' },
        ],
      },
      {
        title: '暗中蓄力',
        outline: '主角不急于发作，完成关键准备，期间配角二次嘲讽。',
        beats: [
          { title: '隐忍布局', goal: '收集证据/提升实力，展示主角谋略。' },
          { title: '二次嘲讽', goal: '对手更加得意，加深反转落差。' },
        ],
      },
      {
        title: '当众打脸',
        outline: '在众人见证下揭示真相或实力，对手全面溃败，主角获得实际利益。',
        beats: [
          { title: '公开反杀', goal: '反转证据亮出，对手颜面扫地。' },
          { title: '清算利益', goal: '收回赌注/地位/资源，爽感落地。' },
          { title: '余波钩子', goal: '引出更强者或新冲突。' },
        ],
      },
    ],
  },
  {
    id: 'dungeon',
    name: '副本探索',
    description: '探索 → 危机 → 结算的副本循环，适合升级流地图推图。',
    volumeOutline: '进入副本 → 规则摸底 → 危机爆发 → 战力结算与收获，结尾抛出下一层秘密。',
    chapters: [
      {
        title: '进入副本',
        outline: '主角与同行者进入新区域，交代规则、目标与代价。',
        beats: [
          { title: '区域规则', goal: '建立副本独特规则与风险提示。' },
          { title: '首遇异象', goal: '小异常预示危机，队伍分工。' },
        ],
      },
      {
        title: '危机爆发',
        outline: '真正的危机让队伍减员或分裂，主角暴露底牌才能破局。',
        beats: [
          { title: '陷阱发动', goal: '全员陷入险境。' },
          { title: '底牌亮出', goal: '主角承担关键任务，战力首次结算。' },
        ],
      },
      {
        title: '结算与埋伏',
        outline: '突破核心区域，收获战利品；离开时发现更深层的阴谋痕迹。',
        beats: [
          { title: '攻克核心', goal: '解决首脑/取得宝物。' },
          { title: '分配收获', goal: '战力/资源结算，队伍关系变化。' },
          { title: '下一层钩子', goal: '发现阴谋痕迹，指向后续副本。' },
        ],
      },
    ],
  },
  {
    id: 'ensemble',
    name: '群像悬疑网状',
    description: '多视角事件 → 嫌疑交织 → 第一重反转，适合悬疑与多线叙事。',
    volumeOutline: '用一场事件引出多组人物与视角，让嫌疑在人物间交织，卷末完成第一重反转并留下最大疑问。',
    chapters: [
      {
        title: '事件发生',
        outline: '异常事件发生，多个视角人物被卷入，各自隐藏动机。',
        beats: [
          { title: '发现异常', goal: '用客观视角呈现事件现场。' },
          { title: '视角分组', goal: '至少两组人马得到不同线索。' },
        ],
      },
      {
        title: '嫌疑交织',
        outline: '各组怀疑对象交错，真凶线索藏在误判之下。',
        beats: [
          { title: '互相指认', goal: '嫌疑落在最不可能的人身上。' },
          { title: '线索引爆', goal: '关键证据反转一次判断。' },
        ],
      },
      {
        title: '第一重反转',
        outline: '当众揭穿一层真相，但背后主使仍未露面。',
        beats: [
          { title: '公开揭底', goal: '洗清一个人，揪出第一层凶手。' },
          { title: '幕后阴影', goal: '新证据显示主使另有其人。' },
        ],
      },
    ],
  },
];

export function templateToVolumeSkeleton(t: BeatTemplate): SkeletonPayload {
  return {
    volumeOutline: t.volumeOutline,
    chapters: t.chapters.map((c) => ({
      title: c.title,
      outline: c.outline,
      beats: c.beats.map((b) => ({ title: b.title, goal: b.goal, points: b.points ?? '' })),
    })),
  };
}

export function templateFirstChapterBeats(t: BeatTemplate): Beat[] {
  return t.chapters[0]?.beats ?? [];
}
