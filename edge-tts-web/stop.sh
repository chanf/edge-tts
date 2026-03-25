#!/bin/bash

# Edge-TTS Web 停止脚本

set -e

# 定义项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# 定义端口
BACKEND_PORT=6605
FRONTEND_PORT=6606

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 清理后端缓存
clean_backend_cache() {
    print_info "清理后端 Python 缓存..."

    # 清理 __pycache__ 目录
    local cache_dirs=$(find "$BACKEND_DIR" -type d -name "__pycache__" 2>/dev/null || true)
    if [ -n "$cache_dirs" ]; then
        echo "$cache_dirs" | xargs rm -rf
        print_success "已清理 __pycache__ 目录"
    fi

    # 清理 .pyc 文件
    local pyc_files=$(find "$BACKEND_DIR" -name "*.pyc" 2>/dev/null || true)
    if [ -n "$pyc_files" ]; then
        echo "$pyc_files" | xargs rm -f
        print_success "已清理 .pyc 文件"
    fi

    # 清理 .pytest_cache
    if [ -d "$BACKEND_DIR/.pytest_cache" ]; then
        rm -rf "$BACKEND_DIR/.pytest_cache"
        print_success "已清理 .pytest_cache"
    fi

    # 保留虚拟环境，只清理缓存
    print_info "Python 虚拟环境已保留"
}

# 清理前端缓存
clean_frontend_cache() {
    print_info "清理前端 Node 缓存..."

    # 清理 node_modules/.vite 缓存
    if [ -d "$FRONTEND_DIR/node_modules/.vite" ]; then
        rm -rf "$FRONTEND_DIR/node_modules/.vite"
        print_success "已清理 Vite 缓存"
    fi

    # 清理 dist 目录
    if [ -d "$FRONTEND_DIR/dist" ]; then
        rm -rf "$FRONTEND_DIR/dist"
        print_success "已清理 dist 目录"
    fi

    # 清理 .tsbuildinfo 文件
    local tsbuild_files=$(find "$FRONTEND_DIR" -name "*.tsbuildinfo" 2>/dev/null || true)
    if [ -n "$tsbuild_files" ]; then
        echo "$tsbuild_files" | xargs rm -f
        print_success "已清理 TypeScript 构建信息文件"
    fi

    # 保留 node_modules，只清理构建缓存
    print_info "node_modules 已保留"
}

# 清理下载的文件
clean_downloads() {
    print_info "清理下载的音频和字幕文件..."

    if [ -d "$BACKEND_DIR/downloads" ]; then
        local file_count=$(find "$BACKEND_DIR/downloads" -type f | wc -l)
        if [ "$file_count" -gt 0 ]; then
            rm -rf "$BACKEND_DIR/downloads"/*
            print_success "已清理 $file_count 个下载文件"
        else
            print_info "下载目录为空"
        fi
    else
        print_info "下载目录不存在"
    fi
}

# 清理日志文件
clean_logs() {
    print_info "清理日志文件..."

    if [ -f "$BACKEND_DIR/backend.log" ]; then
        rm -f "$BACKEND_DIR/backend.log"
        print_success "已清理后端日志"
    fi

    if [ -f "$FRONTEND_DIR/frontend.log" ]; then
        rm -f "$FRONTEND_DIR/frontend.log"
        print_success "已清理前端日志"
    fi

    if [ -f "$BACKEND_DIR/backend.pid" ]; then
        rm -f "$BACKEND_DIR/backend.pid"
    fi

    if [ -f "$FRONTEND_DIR/frontend.pid" ]; then
        rm -f "$FRONTEND_DIR/frontend.pid"
    fi
}

# 检查并杀死指定端口的进程
kill_process_on_port() {
    local port=$1
    local name=$2

    local pid=$(lsof -ti:$port 2>/dev/null || true)

    if [ -n "$pid" ]; then
        print_info "停止 $name (端口 $port, PID: $pid)..."
        kill $pid 2>/dev/null || true
        sleep 1

        # 如果进程仍然存在，强制杀死
        if lsof -ti:$port >/dev/null 2>&1; then
            print_warning "强制终止 $name..."
            kill -9 $pid 2>/dev/null || true
            sleep 1
        fi

        print_success "$name 已停止"
    else
        print_info "$name 端口 $port 未被占用"
    fi
}

# 检查并杀死匹配的进程
kill_process_by_pattern() {
    local pattern=$1
    local name=$2

    local pids=$(pgrep -f "$pattern" 2>/dev/null || true)

    if [ -n "$pids" ]; then
        print_info "停止 $name (PID: $pids)..."
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 1

        # 如果进程仍然存在，强制杀死
        pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            print_warning "强制终止 $name..."
            echo "$pids" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi

        print_success "$name 已停止"
    fi
}

# 显示帮助信息
show_help() {
    cat << EOF
用法: ./stop.sh [选项]

选项:
  无参数          停止服务
  --clean         清理缓存文件（保留 node_modules 和 venv）
  --clean-all     清理所有缓存和下载文件
  --clean-downloads 只清理下载的音频/字幕文件
  --clean-logs    只清理日志文件
  -h, --help      显示此帮助信息

缓存清理说明:
  --clean         清理 Python 缓存 (__pycache__, *.pyc) 和前端构建缓存
  --clean-all     包含 --clean，同时清理下载文件和日志
  --clean-downloads 只清理 downloads 目录中的文件
  --clean-logs    只清理日志文件

注意:
  - node_modules 和 Python 虚拟环境会被保留
  - 如需完全重新安装，删除 node_modules/ 和 venv/ 目录后重新运行 ./start.sh

示例:
  ./stop.sh              # 仅停止服务
  ./stop.sh --clean       # 停止服务并清理缓存
  ./stop.sh --clean-all   # 停止服务并清理所有缓存和文件
EOF
}

# 主函数
main() {
    local CLEAN_CACHE=false
    local CLEAN_ALL=false
    local CLEAN_DOWNLOADS=false
    local CLEAN_LOGS=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clean)
                CLEAN_CACHE=true
                shift
                ;;
            --clean-all)
                CLEAN_CACHE=true
                CLEAN_DOWNLOADS=true
                CLEAN_LOGS=true
                shift
                ;;
            --clean-downloads)
                CLEAN_DOWNLOADS=true
                shift
                ;;
            --clean-logs)
                CLEAN_LOGS=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo "未知选项: $1"
                echo "使用 -h 或 --help 查看帮助"
                exit 1
                ;;
        esac
    done

    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║          Edge-TTS Web 服务停止脚本                   ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # 停止服务
    kill_process_on_port $BACKEND_PORT "后端服务"
    kill_process_on_port $FRONTEND_PORT "前端服务"
    kill_process_by_pattern "uvicorn.*app.main:app" "后端进程"
    kill_process_by_pattern "vite.*--port $FRONTEND_PORT" "前端进程"

    # 清理 PID 文件
    rm -f "$BACKEND_DIR/backend.pid" "$FRONTEND_DIR/frontend.pid"

    # 执行清理操作
    if [ "$CLEAN_CACHE" = true ] || [ "$CLEAN_ALL" = true ]; then
        echo ""
        clean_backend_cache
        clean_frontend_cache
    fi

    if [ "$CLEAN_DOWNLOADS" = true ]; then
        echo ""
        clean_downloads
    fi

    if [ "$CLEAN_LOGS" = true ] || [ "$CLEAN_ALL" = true ]; then
        if [ "$CLEAN_LOGS" = true ] && [ "$CLEAN_ALL" = false ]; then
            echo ""
        fi
        clean_logs
    fi

    echo ""
    print_success "所有服务已停止"

    if [ "$CLEAN_CACHE" = true ] || [ "$CLEAN_ALL" = true ] || [ "$CLEAN_DOWNLOADS" = true ] || [ "$CLEAN_LOGS" = true ]; then
        echo ""
        print_info "缓存清理完成，下次启动将重新构建"
    fi
    echo ""
}

main "$@"
