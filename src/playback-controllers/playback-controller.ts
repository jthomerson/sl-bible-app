import { MatchedMarker } from '@/website-data/website-data';

export interface MediaPlaybackStatus {
    playing: boolean;
    videoTime: number;
    audioTime: number;
    videoPlaybackRate: number;
    audioPlaybackRate: number;
    currentMarker?: MatchedMarker;
}

export function emptyPlaybackStatus(): MediaPlaybackStatus {
    return {
        playing: false,
        videoTime: 0,
        audioTime: 0,
        videoPlaybackRate: 1,
        audioPlaybackRate: 1,
       currentMarker: undefined,
    };
}

export interface PlaybackController {
    jumpToMarker(mrkr: MatchedMarker): void;
    seekByIncrement(v: number): void;
    incrementPlaybackRate(v: number): void;
}
