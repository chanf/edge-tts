/** Chinese translations */

export const zh = {
  // Header
  appTitle: "Edge TTS 语音合成",
  appSubtitle: "基于 Microsoft Edge 在线文本转语音服务",

  // Sections
  textSection: "文本输入",
  voiceSection: "语音选择",
  voice: "音色",
  controlsSection: "音频控制",
  outputSection: "输出结果",

  // TextInput
  textLabel: "文本内容",
  textPlaceholder: "请输入要转换为语音的文本...",
  clear: "清空",
  words: "单词",
  characters: "字符",

  // VoiceSelector
  selectVoice: "选择语音",
  allVoices: "所有语音",
  allGenders: "所有性别",
  allLocales: "所有地区",
  allCountries: "所有国家",
  male: "男声",
  female: "女声",
  searchVoices: "搜索语音...",
  noVoicesFound: "未找到语音",
  letterAll: "全部",
  showingVoices: "显示",
  of: "共",
  voices: "个语音",
  clearFilters: "清除筛选",
  favoriteVoices: "常用语音",
  noFavoriteVoices: "暂无常用语音",
  addToFavorites: "加入常用",
  removeFromFavorites: "移出常用",

  // AudioControls
  audioControls: "音频控制",
  rate: "语速",
  volume: "音量",
  pitch: "音调",
  reset: "重置",

  // Generate Button
  generate: "生成语音",
  generating: "生成中...",
  chunks: "数据块",
  new: "新建",

  // Connection Status
  connected: "已连接",
  connecting: "连接中...",
  disconnected: "已断开",

  // AudioPlayer
  audioPlayer: "音频播放器",
  noAudio: "暂无音频，请先生成",
  play: "播放",
  pause: "暂停",
  previous: "上一个",
  next: "下一个",
  downloadZip: "下载 ZIP",
  playerVolume: "播放音量",
  playerSpeed: "播放速度",
  playerLoop: "循环播放",

  // SubtitleDisplay
  subtitles: "字幕",
  noSubtitles: "暂无字幕，请先生成音频",
  time: "时间",
  text: "文本",

  // Footer
  poweredBy: "由",
  poweredByLink: "edge-tts",
  provided: "提供技术支持 - Microsoft Edge 文本转语音",
  poweredByBy: "由",

  // Errors
  enterText: "请输入文本",
  failedToLoadVoices: "加载语音失败",
  voiceSelected: "已选择语音",
  generateFailed: "生成失败，请稍后重试",
  downloadFailed: "下载失败，请重试（如仍失败请重启服务）",
  deleteFailed: "删除失败，请稍后重试",
  deletePartialFailed: "部分删除失败（{count} 条）",
  confirmDeleteSingle: "确认删除这条历史记录吗？",
  confirmDeleteBatch: "确认删除选中的 {count} 条历史记录吗？",

  // Status
  streamingComplete: "流式传输完成",
  totalChunks: "总数据块",
  loading: "加载中...",

  // History
  history: "生成历史",
  searchHistory: "搜索历史（文本/音色/时间）",
  noHistory: "暂无历史记录",
  delete: "删除",
  deleteSelected: "批量删除",
  createdAt: "创建时间",
  actions: "操作",
};

export type Translations = typeof zh;
