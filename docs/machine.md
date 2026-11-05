# Development machine
Inspected 2026-11-05: Windows 11 Pro, Intel Core i7-6700 (4 cores, 8 threads), Intel HD Graphics 530 (reported 1 GB), about 8 GB RAM, about 1.3 GB RAM free, about 33 GB C: free.
Node 26.10.0, pnpm 11.25.0. FFmpeg/FFprobe initially absent. Installation authorized by user.
Default one concurrent transcode and serial scanning. Intel QSV is a possible future option but must be tested with real media and installed drivers. Do not assume GPU compatibility.
Intel QSV passed a one-second FFmpeg encode on 2026-11-05. Hardware Auto now self-tests candidate encoders and uses CPU fallback.
