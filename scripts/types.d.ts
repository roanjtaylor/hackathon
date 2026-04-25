declare module "youtube-transcript/dist/youtube-transcript.esm.js" {
  export interface TranscriptSegment {
    text: string;
    duration: number;
    offset: number;
    lang?: string;
  }
  export const YoutubeTranscript: {
    fetchTranscript(
      videoId: string,
      config?: { lang?: string; country?: string },
    ): Promise<TranscriptSegment[]>;
  };
}
