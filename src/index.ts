export type { Provider, Posting, ReadResult, EmploymentType, Location } from './types.ts'
export type { BulunanPano as DiscoveredBoard } from './discover.ts'
export { panolariBul as discoverBoards } from './discover.ts'
export { panoOku as readBoard, setUserAgent, htmlDenMetne as htmlToText } from './readers.ts'
export { almanyaMi as looksGerman } from './germany.ts'
export type {
  JobBoard,
  JobBoardReadOptions,
  JobBoardReadResult,
  JobEmploymentType,
  JobLocation,
  JobPosting,
} from './english.ts'
export { discoverJobBoards, readJobBoard, toJobPosting } from './english.ts'
