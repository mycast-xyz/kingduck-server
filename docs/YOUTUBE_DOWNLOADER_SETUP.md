# Windows용 YouTube 다운로더 설정

YouTube Shorts 및 동영상을 스크래핑하고 다운로드하기 위해서는 `yt-dlp`가 필요합니다.
Windows 환경에서는 `npm`을 통해 이 바이너리가 자동으로 설치되지 않으므로, 수동으로 다운로드하거나 제공된 설정 스크립트를 사용해야 합니다.

## 옵션 1: 자동 설정 (권장)

포함된 배치 파일을 실행하여 GitHub에서 최신 `yt-dlp.exe`를 자동으로 다운로드할 수 있습니다:

```cmd
scripts\setup_ytdlp.bat
```

이 스크립트는 다음 작업을 수행합니다:

1.  `yt-dlp` GitHub에서 최신 릴리스 정보를 가져옵니다.
2.  `yt-dlp.exe`를 다운로드합니다.
3.  프로젝트 루트의 `bin/yt-dlp.exe` 경로에 저장합니다.

## 옵션 2: 수동 설치

1.  [yt-dlp 릴리스 페이지](https://github.com/yt-dlp/yt-dlp/releases)로 이동합니다.
2.  `yt-dlp.exe` 파일을 다운로드합니다.
3.  프로젝트 루트(`kingduck-server/`)에 `bin`이라는 폴더를 생성합니다.
4.  다운로드한 `yt-dlp.exe`를 `bin` 폴더로 이동시킵니다.

## 문제 해결 (Troubleshooting)

만약 `spawn yt-dlp ENOENT`와 같은 에러가 발생한다면, 시스템이 `yt-dlp` 실행 파일을 찾지 못한다는 의미입니다.
설정 스크립트를 실행했는지, 혹은 `bin/yt-dlp.exe` 파일이 존재하는지 확인해주세요.
