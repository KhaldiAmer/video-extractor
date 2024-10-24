class VideoSectionHandler {
    constructor() {
        this.selectedSection = null;
        this.highlightOverlay = null;
        this.isSelecting = false;
        this.mediaRecorder = null;
        this.chunks = [];
        this.setupUI();
        this.setupEventListeners();
    }

    setupUI() {
        const controls = document.createElement('div');
        controls.innerHTML = `
            <div id="video-controls" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #fff;
                padding: 10px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 10000;
            ">
                <button id="select-section">Select Section</button>
                <button id="download-video" disabled>Download Video</button>
                <div id="status"></div>
            </div>
        `;
        document.body.appendChild(controls);

        this.highlightOverlay = document.createElement('div');
        this.highlightOverlay.style.cssText = `
            position: absolute;
            background: rgba(75, 105, 255, 0.2);
            border: 2px solid rgb(75, 105, 255);
            pointer-events: none;
            display: none;
            z-index: 9999;
        `;
        document.body.appendChild(this.highlightOverlay);
    }

    setupEventListeners() {
        const selectButton = document.getElementById('select-section');
        const downloadButton = document.getElementById('download-video');

        selectButton.addEventListener('click', () => this.startSelection());
        downloadButton.addEventListener('click', () => this.handleDownload());

        document.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.cancelSelection();
        });
    }

    startSelection() {
        this.isSelecting = true;
        document.body.style.cursor = 'crosshair';
        document.getElementById('status').textContent = 'Select a section containing video';
    }

    cancelSelection() {
        this.isSelecting = false;
        document.body.style.cursor = 'default';
        this.highlightOverlay.style.display = 'none';
        document.getElementById('status').textContent = '';
    }

    handleMouseDown(e) {
        if (!this.isSelecting) return;
        this.selectionStart = { x: e.pageX, y: e.pageY };
        this.highlightOverlay.style.display = 'block';
    }

    handleMouseMove(e) {
        if (!this.isSelecting || !this.selectionStart) return;

        const rect = {
            left: Math.min(this.selectionStart.x, e.pageX),
            top: Math.min(this.selectionStart.y, e.pageY),
            width: Math.abs(e.pageX - this.selectionStart.x),
            height: Math.abs(e.pageY - this.selectionStart.y)
        };

        Object.assign(this.highlightOverlay.style, {
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px'
        });
    }

    handleMouseUp(e) {
        if (!this.isSelecting) return;

        const rect = this.highlightOverlay.getBoundingClientRect();
        const elements = document.elementsFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );

        this.findAndSetupVideo(elements);
        this.isSelecting = false;
        document.body.style.cursor = 'default';
    }

    findAndSetupVideo(elements) {
        const videoElement = elements.find(el =>
            el.tagName === 'VIDEO' ||
            el.querySelector('video')
        );

        if (videoElement) {
            this.selectedSection = videoElement;
            document.getElementById('download-video').disabled = false;
            document.getElementById('status').textContent = 'Video found! Click download to save.';
        } else {
            document.getElementById('status').textContent = 'No video found in selection.';
            this.highlightOverlay.style.display = 'none';
        }
    }

    async setupMediaRecorder(stream) {
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 8000000 // 8 Mbps
        };

        this.mediaRecorder = new MediaRecorder(stream, options);
        this.chunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'video_with_audio.webm';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            document.getElementById('status').textContent = 'Download complete!';
        };
    }

    async captureVideoWithAudio(video) {
        // Create canvas for video
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        // Get video stream from canvas
        const videoStream = canvas.captureStream(30); // 30 FPS

        // Create audio context and source
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const destination = audioCtx.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioCtx.destination); // Also play audio through speakers

        // Combine video and audio streams
        const tracks = [
            ...videoStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ];
        const combinedStream = new MediaStream(tracks);

        return {
            stream: combinedStream,
            captureFrame: () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                requestAnimationFrame(() => this.captureFrame(video, ctx, canvas));
            }
        };
    }

    captureFrame(video, ctx, canvas) {
        if (video.ended || !this.mediaRecorder) {
            this.mediaRecorder.stop();
            return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(() => this.captureFrame(video, ctx, canvas));
    }

    async handleDownload() {
        const status = document.getElementById('status');
        status.textContent = 'Starting capture...';

        try {
            const video = this.selectedSection.tagName === 'VIDEO' ?
                this.selectedSection :
                this.selectedSection.querySelector('video');

            if (!video) {
                throw new Error('Video element not found');
            }

            // Setup capture
            const { stream, captureFrame } = await this.captureVideoWithAudio(video);
            await this.setupMediaRecorder(stream);

            // Start recording
            video.currentTime = 0; // Reset video to start
            await video.play();
            this.mediaRecorder.start();
            captureFrame();
            status.textContent = 'Recording video with audio...';

            // Stop recording when video ends
            video.onended = () => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                }
            };

        } catch (error) {
            status.textContent = `Error: ${error.message}`;
            console.error('Download error:', error);
        }
    }
}

const videoSectionHandler = new VideoSectionHandler();
