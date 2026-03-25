#!/bin/bash

# Edge-TTS Web 一键启动脚本

set -e

# 定义项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# 定义端口
BACKEND_PORT=6605
FRONTEND_PORT=6606

# 定义进程标识
BACKEND_PROCESS="uvicorn.*app.main:app"
FRONTEND_PROCESS="vite.*--port $FRONTEND_PORT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查并杀死指定端口的进程
kill_process_on_port() {
    local port=$1
    local name=$2

    local pid=$(lsof -ti:$port 2>/dev/null || true)

    if [ -n "$pid" ]; then
        print_warning "发现 $name 正在端口 $port 运行 (PID: $pid)"
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
        print_warning "发现 $name 进程正在运行: $pids"
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

# 等待端口释放
wait_for_port() {
    local port=$1
    local max_wait=5
    local count=0

    while lsof -ti:$port >/dev/null 2>&1; do
        if [ $count -ge $max_wait ]; then
            print_error "端口 $port 无法释放"
            return 1
        fi
        sleep 1
        count=$((count + 1))
    done
}

# 检查依赖是否安装
check_dependencies() {
    print_info "检查依赖..."

    # 检查 Python
    if ! command -v python3 &> /dev/null; then
        print_error "未找到 Python 3，请先安装"
        exit 1
    fi

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        print_error "未找到 Node.js，请先安装"
        exit 1
    fi

    # 检查 npm
    if ! command -v npm &> /dev/null; then
        print_error "未找到 npm，请先安装"
        exit 1
    fi

    print_success "依赖检查通过"
}

# 安装后端依赖
install_backend_deps() {
    print_info "检查后端依赖..."

    if [ ! -d "$BACKEND_DIR/venv" ]; then
        print_info "创建 Python 虚拟环境..."
        python3 -m venv "$BACKEND_DIR/venv"
    fi

    source "$BACKEND_DIR/venv/bin/activate"

    if [ ! -f "$BACKEND_DIR/venv/.installed" ]; then
        print_info "安装后端 Python 依赖..."
        pip install -q -r "$BACKEND_DIR/requirements.txt"
        touch "$BACKEND_DIR/venv/.installed"
        print_success "后端依赖安装完成"
    else
        print_info "后端依赖已安装"
    fi
}

# 安装前端依赖
install_frontend_deps() {
    print_info "检查前端依赖..."

    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        print_info "安装前端 npm 依赖..."
        cd "$FRONTEND_DIR"
        npm install --silent
        print_success "前端依赖安装完成"
    else
        print_info "前端依赖已安装"
    fi
}

# 主函数
main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║          Edge-TTS Web 服务启动脚本                   ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # 检查依赖
    check_dependencies

    # 清理旧进程
    print_info "清理旧进程..."
    kill_process_on_port $BACKEND_PORT "后端服务"
    kill_process_on_port $FRONTEND_PORT "前端服务"
    kill_process_by_pattern "$BACKEND_PROCESS" "后端进程"
    kill_process_by_pattern "$FRONTEND_PROCESS" "前端进程"

    wait_for_port $BACKEND_PORT
    wait_for_port $FRONTEND_PORT

    # 安装依赖
    install_backend_deps
    install_frontend_deps

    # 创建下载目录
    mkdir -p "$BACKEND_DIR/downloads"

    # 启动后端服务
    print_info "启动后端服务 (端口 $BACKEND_PORT)..."
    cd "$BACKEND_DIR"
    source "$BACKEND_DIR/venv/bin/activate"
    nohup uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT > "$BACKEND_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$BACKEND_DIR/backend.pid"

    # 等待后端启动
    print_info "等待后端服务启动..."
    sleep 3

    # 检查后端是否启动成功
    if curl -s "http://127.0.0.1:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
        print_success "后端服务启动成功 (PID: $BACKEND_PID)"
    else
        print_error "后端服务启动失败，请查看日志: $BACKEND_DIR/backend.log"
        exit 1
    fi

    # 启动前端服务
    print_info "启动前端服务 (端口 $FRONTEND_PORT)..."
    cd "$FRONTEND_DIR"
    nohup npm run dev -- --port $FRONTEND_PORT > "$FRONTEND_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$FRONTEND_DIR/frontend.pid"

    # 等待前端启动
    sleep 3

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗"
    echo "║                   服务启动成功！                            ║"
    echo "╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BLUE}前端地址:${NC}     http://localhost:$FRONTEND_PORT"
    echo -e "  ${BLUE}后端地址:${NC}     http://localhost:$BACKEND_PORT"
    echo -e "  ${BLUE}API 文档:${NC}     http://localhost:$BACKEND_PORT/docs"
    echo ""
    echo -e "  ${YELLOW}后端日志:${NC}     $BACKEND_DIR/backend.log"
    echo -e "  ${YELLOW}前端日志:${NC}     $FRONTEND_DIR/frontend.log"
    echo ""
    echo -e "  ${YELLOW}停止服务:${NC}     ./stop.sh 或 ./start.sh --stop"
    echo -e "  ${YELLOW}清理缓存:${NC}     ./stop.sh --clean"
    echo ""
}

# 处理停止命令
if [ "$1" = "--stop" ]; then
    print_info "停止所有服务..."
    kill_process_on_port $BACKEND_PORT "后端服务"
    kill_process_on_port $FRONTEND_PORT "前端服务"
    kill_process_by_pattern "$BACKEND_PROCESS" "后端进程"
    kill_process_by_pattern "$FRONTEND_PROCESS" "前端进程"

    # 清理 PID 文件
    rm -f "$BACKEND_DIR/backend.pid" "$FRONTEND_DIR/frontend.pid"

    print_success "所有服务已停止"
    exit 0
fi

# 运行主函数
main
