import getPlaceholderBooks from './placeholder-books';

const DEFAULT_BASE_SITE_URL = 'https://www.jw.org',
    DEFAULT_FILE_API_URL = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS',
    DEFAULT_SIGN_LANG: BasicLang = { locale: 'ase', code: 'ASL' },
    DEFAULT_SPKN_LANG: BasicLang = { locale: 'en', code: 'E' },
    DEFAULT_RESOLUTION = '480p';

export interface BasicLang {
    locale: string;
    code: string;
}

export interface BibleBook {
    num: number;
    name: string;
    abbr: string;
    chapters: number;
}

export interface MatchedMarker {
    id: number;
    label: string;
    verse: number;

    signed: {
        start: number;
        end: number;
        transition: number;
    };

    spoken: {
        start: number;
        end: number;
    };

}

export interface MediaData {
    signed: {
        url: string;
        resolution: string;
        frameWidth: number;
        frameHeight: number;
    };

    spoken: {
        url: string;
    };

    markers: MatchedMarker[];
}

function strToSeconds(str: string) {
    const [ hr, min, sec ] = str.split(':').map((v) => { return Number(v); });

    return (hr * 3600) + (min * 60) + sec;
}

export default class WebsiteData {

    private _baseSiteURL: string;
    private _fileAPIURL: string;
    private _signedLang: BasicLang = DEFAULT_SIGN_LANG;
    private _spokenLang: BasicLang = DEFAULT_SPKN_LANG;
    private _resolution: string = DEFAULT_RESOLUTION;

    public constructor(opts?: { baseSiteURL?: string; fileAPIURL?: string }) {
        this._baseSiteURL = (opts?.baseSiteURL || DEFAULT_BASE_SITE_URL).replace(/\/+$/, '');
        this._fileAPIURL = (opts?.fileAPIURL || DEFAULT_FILE_API_URL).replace(/\/+$/, '');
    }

    public getBibleEditionsListURL(): string {
        return `${this._baseSiteURL}/en/library/bible/json/`;
    }

    public getBibleBooksListURL(): string {
        return `${this._baseSiteURL}/ase/library/bible/nwt/books/json/`;
    }

    public getBibleMediaURL(type: 'MP4' | 'MP3', langCode: string, book: number, chap: number): string {
        const fileTypes = (type === 'MP4' ? 'MP4,M4V' : type);

        return `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?booknum=${book}&output=json&pub=nwt&fileformat=${fileTypes}&alllangs=0&track=${chap}&langwritten=${langCode}&txtCMSLang=E`;
    }

    public async getAvailableBooks(): Promise<BibleBook[]> {
        await new Promise((resolve) => { setTimeout(resolve, Math.random() * 2500)});

        return getPlaceholderBooks();
    }

    public async getPubMedia(type: 'MP4' | 'MP3', langCode: string, book: number, chap: number): Promise<any> {
        const url = this.getBibleMediaURL(type, langCode, book, chap),
            resp = await fetch(url),
            body = await resp.json();

        return { url, ...body };
    }

    public findBestFile(files: any[], type: 'MP4' | 'MP3'): any {
        if (type === 'MP4') {
            return files.find((f) => { return f.label === this._resolution; }) || files[files.length - 1];
        }

        return files[files.length - 1];
    }

    public matchMarkers(signMarkers: any, spknMarkers: any): MatchedMarker[] {
        const paired = [
            [ 'Introduction', 0, signMarkers.introduction, spknMarkers.introduction ],
            ...signMarkers.markers.map((signed: any) => {
                const spkn = spknMarkers.markers.find((m: any) => { return m.verseNumber === signed.verseNumber; });

                return [ signed.label, signed.verseNumber, signed, spkn ];
            }),
        ];

        return paired.map((p, i): MatchedMarker => {
            const [ label, verseNum, signed, spoken ] = p;

            const signedStart = strToSeconds(signed.startTime),
                signedEnd = signedStart + strToSeconds(signed.duration),
                signedTransition = signed.endTransitionDuration ? strToSeconds(signed.endTransitionDuration) : 0,
                spokenStart = spoken?.startTime ? strToSeconds(spoken.startTime) : 0,
                spokenEnd = spokenStart + (spoken?.duration ? strToSeconds(spoken.duration) : 0);

            return {
                id: i,
                label,
                verse: Number(verseNum),
                signed: {
                    start: signedStart,
                    end: signedEnd,
                    transition: signedTransition,
                },
                spoken: {
                    start: spokenStart,
                    end: spokenEnd,
                },
            };
        });
    }

    public async getMediaData(book: number, chap: number): Promise<MediaData> {
        const [ signedData, spokenData ] = await Promise.all([
            this.getPubMedia('MP4', this._signedLang.code, book, chap),
            this.getPubMedia('MP3', this._spokenLang.code, book, chap),
        ]);

        const signedFiles = (signedData.files[this._signedLang.code].MP4 || signedData.files[this._signedLang.code].M4V || []),
            spokenFiles = (spokenData.files[this._spokenLang.code].MP3 || []),
            vidFile = this.findBestFile(signedFiles, 'MP4'),
            audFile = this.findBestFile(spokenFiles, 'MP3');

        if (!vidFile) {
            throw new Error(`Did not find video file in PMAPI response: ${signedData.url}`);
        }
        if (!audFile) {
            throw new Error(`Did not find audio file in PMAPI response: ${spokenData.url}`);
        }

        const signMarkers = vidFile.markers || signedFiles.find((f: any) => { return !!f.markers; })?.markers,
              spknMarkers = audFile.markers || spokenFiles.find((f: any) => { return !!f.markers; })?.markers;

        if (!signMarkers) {
            throw new Error(`Did not find video markers in PMAPI response: ${signedData.url}`);
        }
        if (!spknMarkers) {
            throw new Error(`Did not find audio markers in PMAPI response: ${spokenData.url}`);
        }

        return {
            signed: {
                url: vidFile.file.url,
                frameWidth: vidFile.frameWidth,
                frameHeight: vidFile.frameHeight,
                resolution: vidFile.label,
            },

            spoken: {
                url: audFile.file.url,
            },

            markers: this.matchMarkers(signMarkers, spknMarkers),
        };
    }

}
