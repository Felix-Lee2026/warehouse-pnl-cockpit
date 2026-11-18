#!/bin/sh
# 回归测试
#   在仓库根目录：sh tests/run.sh
#   指定别的目标文件：TARGET=path/to.html sh tests/run.sh
#
# 只用 node 内置模块，不装任何依赖。
# 输出每个套件的 OK / FAIL；有 FAIL、断言数为 0、或中途抛异常都会让退出码非 0。

DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$DIR")

# Git Bash 的 pwd 是 /c/Users/…，node 会把它当成 C:\c\Users\…，必须转成 Windows 路径。
# Linux / macOS 上没有 cygpath，原样保留。
if command -v cygpath >/dev/null 2>&1; then
  DIR=$(cygpath -m "$DIR")
  ROOT=$(cygpath -m "$ROOT")
fi

TARGET="${TARGET:-$ROOT/warehouse-pnl-cockpit.html}"

if [ ! -f "$TARGET" ]; then
  echo "找不到目标文件：$TARGET"
  exit 2
fi

echo "目标：$TARGET"
echo ""

BAD=0
TOTAL_OK=0
TOTAL_FAIL=0

for t in _t _t2 _t3 _t4 _t5 _t6 _t7 _t8 _t9 _t10 _t11 _t12 _t13 _t14 _t15 _t16 _t17 _t18 _t19 _t20 \
         _t21 _t22 _t23 _t24 _t25 _t26 _t27 _t28 _t29 _t30 _t31 _t32 _t33 _t34 _t35 _t36 _t37 _t38 _t39; do
  node -e "
    const fs=require('fs');
    const h=fs.readFileSync('$TARGET','utf8');
    const m=h.match(/<script>([\s\S]*)<\/script>/);
    if(!m){ console.error('目标文件里找不到 <script> 块'); process.exit(3); }
    let s=m[1];
    s=s.replace('\"use strict\";','\"use strict\";'+fs.readFileSync('$DIR/_stub.js','utf8'));
    fs.writeFileSync('$DIR/_run.js','global.SRC='+JSON.stringify(h)+';\n'+s+fs.readFileSync('$DIR/$t.js','utf8'));
  " 2>/dev/null
  if [ ! -f "$DIR/_run.js" ]; then
    echo "$t : 生成失败"
    BAD=$((BAD + 1))
    continue
  fi

  R=$(node "$DIR/_run.js" 2>&1 | grep -v "本地存储\|at storePut\|at init")
  OK=$(echo "$R" | grep -c '  OK' || true)
  FAIL=$(echo "$R" | grep -c '  FAIL' || true)
  TOTAL_OK=$((TOTAL_OK + OK))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

  if [ "$OK" = "0" ]; then
    echo "$t : OK=0 FAIL=$FAIL  ⚠ EMPTY（套件未执行任何断言）"
    echo "$R" | grep -i "error\|SyntaxError\|ReferenceError\|TypeError" | head -3
    BAD=$((BAD + 1))
    continue
  fi

  # 中途崩溃但已经跑了几条断言 → OK 是正数，看着像"通过"。
  # 这是最容易被漏掉的一种：套件后半段根本没执行。
  CRASH=$(echo "$R" | grep -cE "ReferenceError|TypeError|SyntaxError|RangeError|is not a function|is not defined" || true)
  if [ "$CRASH" != "0" ]; then
    echo "$t : OK=$OK FAIL=$FAIL  ⚠ CRASH（套件中途抛异常，后面的断言没跑）"
    echo "$R" | grep -E "ReferenceError|TypeError|SyntaxError|RangeError|is not a function|is not defined" | head -2
    BAD=$((BAD + 1))
    continue
  fi

  if [ "$FAIL" != "0" ]; then
    echo "$t : OK=$OK FAIL=$FAIL"
    echo "$R" | grep '  FAIL' | head -8
    BAD=$((BAD + 1))
  else
    echo "$t : OK=$OK"
  fi
done

rm -f "$DIR/_run.js"

echo ""
echo "────────────────────────────────"
echo "合计  OK=$TOTAL_OK  FAIL=$TOTAL_FAIL  异常套件=$BAD"

if [ "$BAD" != "0" ] || [ "$TOTAL_FAIL" != "0" ]; then
  echo "❌ 未通过"
  exit 1
fi
echo "✅ 全部通过"
exit 0
