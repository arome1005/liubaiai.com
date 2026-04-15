/**
 * v0「藏经」参考书假数据（与 {@link ../v0-modules/cangjing-module} 同源）。
 * 问策「技法卡」等模块通过 referenceBookId 关联此处条目。
 */
export type MockReferenceBook = {
  id: string;
  title: string;
  author: string;
  chapters: number;
  words: number;
  tags: string[];
  isLocal: boolean;
  isFavorite: boolean;
  readProgress: number;
  lastRead?: string;
  coverColor: string;
  extractedCount: number;
  rating: number;
};

export const MOCK_REFERENCE_BOOKS: MockReferenceBook[] = [
  {
    id: "1",
    title: "诡秘之主",
    author: "爱潜水的乌贼",
    chapters: 1432,
    words: 4680000,
    tags: ["玄幻", "克苏鲁", "职业体系"],
    isLocal: true,
    isFavorite: true,
    readProgress: 100,
    lastRead: "2024-01-15",
    coverColor: "from-amber-900/40 to-amber-950/60",
    extractedCount: 24,
    rating: 5,
  },
  {
    id: "2",
    title: "剑来",
    author: "烽火戏诸侯",
    chapters: 1200,
    words: 5200000,
    tags: ["仙侠", "剑道", "成长"],
    isLocal: true,
    isFavorite: true,
    readProgress: 78,
    lastRead: "2024-01-10",
    coverColor: "from-blue-900/40 to-blue-950/60",
    extractedCount: 18,
    rating: 5,
  },
  {
    id: "3",
    title: "大奉打更人",
    author: "卖报小郎君",
    chapters: 892,
    words: 3100000,
    tags: ["探案", "古风", "官场"],
    isLocal: true,
    isFavorite: false,
    readProgress: 45,
    coverColor: "from-emerald-900/40 to-emerald-950/60",
    extractedCount: 12,
    rating: 4,
  },
  {
    id: "4",
    title: "道诡异仙",
    author: "狐尾的笔",
    chapters: 560,
    words: 1800000,
    tags: ["修仙", "诡异", "心理"],
    isLocal: true,
    isFavorite: false,
    readProgress: 32,
    coverColor: "from-purple-900/40 to-purple-950/60",
    extractedCount: 8,
    rating: 4,
  },
  {
    id: "5",
    title: "凡人修仙传",
    author: "忘语",
    chapters: 2446,
    words: 7440000,
    tags: ["修仙", "凡人流", "经典"],
    isLocal: true,
    isFavorite: true,
    readProgress: 100,
    lastRead: "2023-12-20",
    coverColor: "from-cyan-900/40 to-cyan-950/60",
    extractedCount: 31,
    rating: 5,
  },
  {
    id: "6",
    title: "庆余年",
    author: "猫腻",
    chapters: 746,
    words: 3800000,
    tags: ["权谋", "穿越", "争霸"],
    isLocal: true,
    isFavorite: false,
    readProgress: 88,
    lastRead: "2024-01-05",
    coverColor: "from-rose-900/40 to-rose-950/60",
    extractedCount: 15,
    rating: 5,
  },
  {
    id: "7",
    title: "雪中悍刀行",
    author: "烽火戏诸侯",
    chapters: 1045,
    words: 4500000,
    tags: ["武侠", "江湖", "热血"],
    isLocal: true,
    isFavorite: false,
    readProgress: 62,
    coverColor: "from-slate-800/40 to-slate-950/60",
    extractedCount: 9,
    rating: 4,
  },
  {
    id: "8",
    title: "斗破苍穹",
    author: "天蚕土豆",
    chapters: 1648,
    words: 5300000,
    tags: ["玄幻", "热血", "升级"],
    isLocal: true,
    isFavorite: false,
    readProgress: 100,
    lastRead: "2023-11-15",
    coverColor: "from-orange-900/40 to-orange-950/60",
    extractedCount: 20,
    rating: 4,
  },
  {
    id: "9",
    title: "斗罗大陆",
    author: "唐家三少",
    chapters: 336,
    words: 2970000,
    tags: ["玄幻", "热血", "成长"],
    isLocal: true,
    isFavorite: true,
    readProgress: 100,
    lastRead: "2024-01-08",
    coverColor: "from-indigo-900/40 to-indigo-950/60",
    extractedCount: 22,
    rating: 5,
  },
  {
    id: "10",
    title: "全职高手",
    author: "蝴蝶蓝",
    chapters: 1728,
    words: 5350000,
    tags: ["游戏", "竞技", "热血"],
    isLocal: true,
    isFavorite: true,
    readProgress: 100,
    lastRead: "2024-01-12",
    coverColor: "from-teal-900/40 to-teal-950/60",
    extractedCount: 19,
    rating: 5,
  },
];

export function getMockReferenceBook(id: string): MockReferenceBook | undefined {
  return MOCK_REFERENCE_BOOKS.find((b) => b.id === id);
}
