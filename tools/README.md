
## push_nano_banana.ps1 — Windows側で1回だけ実行するもの

Nano Banana のパイプラインを `character-motion-studio` へ上げるスクリプト。
Claude はそのマシンを見られないので、ここだけは手元で実行する必要がある。

**既定は下見で、何も変更しない。**

```
powershell -ExecutionPolicy Bypass -File tools\push_nano_banana.ps1
```

やること。別のリポジトリの中にないかの確認、`.env` と `AIza` の走査、
`.gitignore` の不足分、上がる予定のファイル一覧とサイズ。
鍵らしき文字列を本文に見つけたらその場で止める。

内容を確認してから `-Push` を付けて再実行すると、commit と push まで行う。

```
powershell -ExecutionPolicy Bypass -File tools\push_nano_banana.ps1 -Push
```

パスが違う場合は `-Path` で指定する。PowerShell は手元にないので動作確認
できていない。下見の出力がおかしければ貼ってほしい。
