// ui.js — ColorUI 风格界面：主页菜单 / 网格矩阵编辑器 / hash 路由 / KaTeX 结果渲染
(function () {
  "use strict";

  /* ================= 功能注册表 ================= */
  var FNS = [
    { g: "矩阵基础", items: [
      { id: "det", label: "行列式", sub: "展开与化简", title: "行列式",
        fields: [["content", "square", "请输入方阵", "1 2 3\n4 3 5\n-1 0 6"]],
        hint: "行列数相同；支持分数 3/2、小数、符号 a、幂 a**2、根式 sqrt(2)、复数 1+2I", sample: "1 2 3\n4 3 5\n-1 0 6" },
      { id: "inverse", label: "逆矩阵", sub: "(A|E) 初等行变换", title: "逆矩阵",
        fields: [["content", "square", "请输入可逆方阵", "2 1 -1\n1 1 1\n1 2 3"]],
        hint: "方阵需可逆（行列式≠0）", sample: "2 1 -1\n1 1 1\n1 2 3" },
      { id: "adj", label: "伴随矩阵", sub: "代数余子式转置", title: "伴随矩阵",
        fields: [["content", "square", "请输入方阵", "1 2\n3 4"]], hint: "A* 的第 j 行第 i 列 = A_ij", sample: "1 2\n3 4" },
      { id: "algebraicCofactor", label: "余子式 · 代数余子式", sub: "按行/列/全部", title: "余子式与代数余子式",
        fields: [["content", "square", "请输入方阵", "1 2 3\n4 5 6\n7 8 9"],
                 ["cdMethod", "pick", "类型", ["rows", "按行", "cols", "按列", "all", "全部"]],
                 ["cdPos", "line", "行/列号（从 1 起）", "3"],
                 ["cdCoef", "line", "列/行号列表（空 = 全部）", "2 3"]],
        hint: "余子式 M_ij 划去第 i 行第 j 列；代数余子式 A_ij = (-1)^(i+j) M_ij", sample: "1 2 3\n4 5 6\n7 8 9" },
      { id: "conjugateTranspose", label: "转置 · 共轭转置", sub: "A^T / A^H", title: "转置与共轭转置",
        fields: [["content", "matrix", "请输入矩阵（支持复数 1+2I）", "1+2I 3\n3-2I 2"]],
        hint: "含复数时自动求共轭转置 A^H", sample: "1+2I 3\n3-2I 2" },
      { id: "matrixOperations", label: "矩阵运算", sub: "A±B · AB · 数乘", title: "矩阵运算",
        fields: [["moMethod", "pick", "运算", ["*", "A×B", "+", "A+B", "-", "A−B", "scalarMultiply", "数乘"]],
                 ["contentA", "matrix", "矩阵 A", "1 2\n3 4"],
                 ["contentB", "matrix", "矩阵 B", "0 1\n1 0"],
                 ["base", "line", "数乘系数（数乘时使用）", "3/2"]],
        hint: "加法需同型；乘法 A 的列数 = B 的行数", sample: "1 2\n3 4" },
      { id: "power", label: "矩阵幂 A^n", sub: "n 可为负", title: "矩阵幂",
        fields: [["content", "square", "请输入方阵", "1 1\n0 1"], ["count", "num", "n", "5"]],
        hint: "n=0 得单位阵；n<0 先求逆再乘", sample: "1 1\n0 1" },
      { id: "matrixEquation", label: "矩阵方程", sub: "AX=C · XA=C · AXB=C", title: "矩阵方程",
        fields: [["meMethod", "pick", "类型", ["AX=C", "AX=C", "XA=C", "XA=C", "AXB=C", "AXB=C"]],
                 ["mA", "matrix", "A", "1 2\n3 4"],
                 ["mB", "matrix", "B（AXB=C 时使用）", "2 3\n1 4"],
                 ["mC", "matrix", "C", "3 1\n2 3"]],
        hint: "AX=C → X=A⁻¹C；XA=C → X=CA⁻¹；AXB=C → X=A⁻¹CB⁻¹", sample: "1 2\n3 4" },
    ]},
    { g: "线性方程组", items: [
      { id: "linearEquation", label: "线性方程组", sub: "唯一解 / 通解 / 无解", title: "线性方程组",
        fields: [["content", "augmented", "请输入增广矩阵（最后一列为常数项）", "2 1 -1 1 2\n1 1 -2 1 4\n4 -6 2 -2 4\n3 6 -9 7 9"]],
        hint: "每行一个方程：系数 … 常数项；支持参数 a", sample: "2 1 -1 1 2\n1 1 -2 1 4\n4 -6 2 -2 4\n3 6 -9 7 9" },
      { id: "cramersRule", label: "克拉默法则", sub: "D / D_i / x_i", title: "克拉默法则",
        fields: [["content", "augmented", "请输入 n×(n+1) 增广矩阵", "1 2 1 4\n2 -1 3 9\n3 1 2 7"]],
        hint: "要求系数行列式 D≠0", sample: "1 2 1 4\n2 -1 3 9\n3 1 2 7" },
      { id: "rank", label: "矩阵的秩", sub: "支持参数讨论", title: "矩阵的秩",
        fields: [["content", "matrix", "请输入矩阵", "1 1 a\n-1 a 1\n1 -1 2"]],
        hint: "含单参数时自动分析特殊取值（如 a=-1）", sample: "1 1 a\n-1 a 1\n1 -1 2" },
      { id: "rowEchelonForm", label: "行阶梯形", sub: "Gauss 消元", title: "行阶梯形",
        fields: [["content", "matrix", "请输入矩阵", "0 3 -6 6 4 -5\n3 -7 8 -5 8 9\n3 -9 12 -9 6 15"]],
        hint: "每一步行变换都有标注", sample: "0 3 -6 6 4 -5\n3 -7 8 -5 8 9\n3 -9 12 -9 6 15" },
      { id: "standard", label: "行最简形", sub: "RREF", title: "行最简形",
        fields: [["content", "matrix", "请输入矩阵", "2 3 0 1 -4\n0 2 2 3 -7\n1 0 1 1 0\n1 2 -1 3 -12"]],
        hint: "主元为 1 且主元列其余为 0", sample: "2 3 0 1 -4\n0 2 2 3 -7\n1 0 1 1 0\n1 2 -1 3 -12" },
      { id: "leastSquares", label: "最小二乘", sub: "正规方程 A^TAx=A^Tb", title: "最小二乘",
        fields: [["content", "augmented", "请输入增广矩阵 [A|b]", "1 2 1\n-1 1 1\n1 3 1"]],
        hint: "A^TA 奇异时请用「最优最小二乘」", sample: "1 2 1\n-1 1 1\n1 3 1" },
      { id: "bestLeastSquares", label: "最优最小二乘", sub: "广义逆 A⁺b", title: "最优最小二乘",
        fields: [["content", "augmented", "请输入增广矩阵 [A|b]", "1 1 1 3\n1 1 2 4"]],
        hint: "A⁺ 为 Moore-Penrose 广义逆，给出最小范数解", sample: "1 1 1 3\n1 1 2 4" },
      { id: "LU", label: "LU 分解", sub: "Doolittle", title: "LU 分解",
        fields: [["content", "square", "请输入方阵（主元非零）", "2 1 1\n1 -1 -1\n1 2 1"]],
        hint: "L 单位下三角，U 上三角", sample: "2 1 1\n1 -1 -1\n1 2 1" },
    ]},
    { g: "特征值族", items: [
      { id: "eigenvals", label: "特征值 · 特征向量", sub: "精确根式", title: "特征值与特征向量",
        fields: [["content", "square", "请输入数字方阵", "0 1 0\n1 0 1\n0 1 0"],
                 ["mode", "pick", "行列式形式", ["|\u03bbE-A|", "|λE−A|", "|A-\u03bbE|", "|A−λE|"]]],
        hint: "特征多项式精确因式分解；含不可约三次因子时超出本地能力", sample: "0 1 0\n1 0 1\n0 1 0" },
      { id: "diagonalize", label: "相似对角化", sub: "P⁻¹AP=Λ", title: "相似对角化",
        fields: [["content", "square", "请输入可对角化方阵", "2 1\n1 2"]],
        hint: "每个特征值几何重数 = 代数重数才可对角化", sample: "2 1\n1 2" },
      { id: "similar", label: "相似对角化（对称阵示例）", sub: "P⁻¹AP=Λ", title: "相似对角化",
        fields: [["content", "square", "请输入方阵", "-1 1 0\n-4 3 0\n1 0 2"]],
        hint: "特征向量按列组成 P", sample: "-1 1 0\n-4 3 0\n1 0 2" },
      { id: "jordan", label: "Jordan 标准形", sub: "有理特征值", title: "Jordan 标准形",
        fields: [["content", "square", "请输入方阵", "1 1\n0 1"]],
        hint: "仅支持全部特征值有理的情形", sample: "1 1\n0 1" },
      { id: "similarity", label: "判断相似", sub: "A ~ B ?", title: "相似性判断",
        fields: [["contentA", "matrix", "矩阵 A", "2 1\n1 2"], ["contentB", "matrix", "矩阵 B", "3 0\n0 1"]],
        hint: "特征多项式相同且 Jordan 结构相同 ⇔ 相似", sample: "2 1\n1 2" },
      { id: "transition", label: "过渡矩阵", sub: "基变换 B=AX", title: "过渡矩阵",
        fields: [["contentA", "matrix", "基 A（列向量）", "1 1\n1 2"], ["contentB", "matrix", "基 B", "3 4\n5 7"]],
        hint: "(A|B) 行最简得 (E|X)", sample: "1 1\n1 2" },
      { id: "quadraticFormZ", label: "二次型 · 正交变换", sub: "x=Qy", title: "二次型 · 正交变换",
        fields: [["content", "triu", "请输入对称阵上三角（第 i 行 i 个数）", "2\n-1 2"]],
        hint: "第 1 行 1 个数，第 2 行 2 个数……对应对称阵下三角含对角线", sample: "2\n-1 2" },
      { id: "quadraticFormP", label: "二次型 · 配方法", sub: "x=Cy", title: "二次型 · 配方法",
        fields: [["content", "triu", "请输入对称阵上三角", "2\n4 5"]],
        hint: "可逆线性变换化标准形", sample: "2\n4 5" },
      { id: "quadraticFormH", label: "二次型 · 合同变换", sub: "成对初等变换", title: "二次型 · 合同变换",
        fields: [["content", "triu", "请输入对称阵上三角", "2\n4 5\n-4 -8 5"]],
        hint: "展示全部成对行/列变换过程", sample: "2\n4 5\n-4 -8 5" },
      { id: "orthogonalMatrix", label: "施密特正交化", sub: "正交化 + 单位化", title: "施密特正交化",
        fields: [["content", "matrix", "行向量组（线性无关）", "1 1\n1 2"]],
        hint: "逐组正交化后单位化", sample: "1 1\n1 2" },
      { id: "smith", label: "Smith 标准形", sub: "λ-矩阵", title: "Smith 标准形",
        fields: [["content", "matrix", "多项式矩阵（如 x、x-1、x**2）", "x 1\n0 x-1"]],
        hint: "ℚ[x] 上单变量多项式矩阵", sample: "x 1\n0 x-1" },
      { id: "SVD", label: "奇异值分解", sub: "U Σ Vᵀ（数值）", title: "奇异值分解",
        fields: [["content", "matrix", "请输入矩阵", "1 2\n3 4\n5 6"]],
        hint: "输出为 6 位有效数字的近似值", sample: "1 2\n3 4\n5 6" },
    ]},
    { g: "向量组与杂项", items: [
      { id: "vecRank", label: "向量组的秩", sub: "极大无关组 · 线性表示", title: "向量组的秩",
        fields: [["content", "matrix", "行向量组", "1 0 1 -1\n1 -2 1 1\n2 -2 2 0\n0 2 1 3\n-2 6 0 6"]],
        hint: "每行是一个向量", sample: "1 0 1 -1\n1 -2 1 1\n2 -2 2 0\n0 2 1 3\n-2 6 0 6" },
      { id: "maximalLIS", label: "极大线性无关组", sub: "α₁…α_s", title: "极大线性无关组",
        fields: [["content", "matrix", "行向量组", "1 1 0 1\n0 1 1 0\n1 2 1 1"]],
        hint: "并给出其余向量的线性表示", sample: "1 1 0 1\n0 1 1 0\n1 2 1 1" },
      { id: "norm", label: "矩阵范数", sub: "1 / ∞ / F", title: "矩阵范数",
        fields: [["content", "matrix", "请输入矩阵", "1 2\n3 4"]], hint: "1-范数最大列和；∞-范数最大行和", sample: "1 2\n3 4" },
      { id: "vecNorm", label: "向量范数", sub: "1 / 2 / ∞", title: "向量范数",
        fields: [["content", "matrix", "向量（支持复数）", "1 2 2"]], hint: "2-范数给出精确根式", sample: "1 2 2" },
      { id: "inversionNumber", label: "逆序数", sub: "τ 排列", title: "逆序数",
        fields: [["content", "line", "排列（空格分隔）", "2 1 4 3"]], hint: "列出全部逆序对", sample: "2 1 4 3" },
      { id: "fullRankDecomposition", label: "满秩分解", sub: "A = BC", title: "满秩分解",
        fields: [["content", "matrix", "请输入矩阵", "1 2 3 4\n5 6 7 8\n9 10 11 12"]],
        hint: "B 列满秩，C 行满秩", sample: "1 2 3 4\n5 6 7 8\n9 10 11 12" },
      { id: "generalizedInverse", label: "广义逆 A⁺", sub: "Moore-Penrose", title: "广义逆",
        fields: [["content", "matrix", "请输入矩阵", "1 2 3 4\n5 6 7 8\n9 10 11 12"]],
        hint: "精确有理数结果", sample: "1 2 3 4\n5 6 7 8\n9 10 11 12" },
      { id: "syntheticDivision", label: "综合除法", sub: "多项式除法", title: "综合除法",
        fields: [["polyF", "line", "f(x) 系数（降幂）", "6 0 -7 13"],
                 ["polyG", "line", "g(x) 系数（降幂）", "1 2"]],
        hint: "f(x)=g(x)·q(x)+r(x)；系数支持分数", sample: "6 0 -7 13" },
      { id: "algorithmDivision", label: "辗转相除", sub: "最大公因式", title: "辗转相除法",
        fields: [["polyF", "line", "f(x) 系数（降幂）", "6 0 -7 13"],
                 ["polyG", "line", "g(x) 系数（降幂）", "1 2"]],
        hint: "逐步展示除法过程，公式首一化", sample: "6 0 -7 13" },
      { id: "auxiliary", label: "行变换助手", sub: "记录初等变换", title: "行变换助手",
        fields: [["content", "matrix", "当前矩阵", "2 1 -1\n1 1 1\n1 2 3"],
                 ["opRecord", "line", "行变换记录（分号分隔）", "r2+(-2)r1;r3+(-1)r1;"]],
        hint: "格式：r2+(-2)r1、r1<->r2、2r3、-r2", sample: "2 1 -1\n1 1 1\n1 2 3" },
      { id: "toLatex", label: "转 LaTeX", sub: "预览", title: "转 LaTeX",
        fields: [["content", "matrix", "请输入矩阵", "1 2\n3 4"]], hint: "生成可复制的 LaTeX", sample: "1 2\n3 4" },
    ]},
  ];

  function findFn(id) {
    for (var i = 0; i < FNS.length; i++) for (var j = 0; j < FNS[i].items.length; j++)
      if (FNS[i].items[j].id === id) return FNS[i].items[j];
    return null;
  }
  function pathOf(id) {
    if (id === "quadraticFormZ") return "/quadraticForm?methods=zjbh";
    if (id === "quadraticFormP") return "/quadraticForm?methods=pff";
    if (id === "quadraticFormH") return "/quadraticForm?methods=htbh";
    return "/" + id;
  }

  /* 磁贴图标：id → [数学字形, 色系] */
  var ICO = {
    det: ["|A|", "c-green"], inverse: ["1/A", "c-blue"], adj: ["A*", "c-cyan"],
    algebraicCofactor: ["±A", "c-orange"], conjugateTranspose: ["Aᵀ", "c-purple"],
    matrixOperations: ["⊗", "c-green"], power: ["Aⁿ", "c-blue"], matrixEquation: ["X=", "c-cyan"],
    linearEquation: ["∑x", "c-green"], cramersRule: ["Dn", "c-blue"], rank: ["r(A)", "c-cyan"],
    rowEchelonForm: ["△", "c-purple"], standard: ["≡", "c-orange"],
    leastSquares: ["b̂", "c-green"], bestLeastSquares: ["σ²", "c-blue"], LU: ["LU", "c-cyan"],
    eigenvals: ["λ", "c-green"], diagonalize: ["Λ", "c-blue"], similar: ["Λ≈", "c-cyan"],
    jordan: ["J", "c-purple"], similarity: ["⇔", "c-orange"], transition: ["→", "c-green"],
    quadraticFormZ: ["⊥", "c-blue"], quadraticFormP: ["x²", "c-cyan"], quadraticFormH: ["≡", "c-purple"],
    orthogonalMatrix: ["⟂", "c-orange"], smith: ["S(λ)", "c-green"], SVD: ["Σ*", "c-blue"],
    vecRank: ["r(α)", "c-cyan"], maximalLIS: ["α*", "c-purple"], norm: ["‖A‖", "c-green"],
    vecNorm: ["‖x‖", "c-blue"], inversionNumber: ["τ", "c-cyan"],
    fullRankDecomposition: ["BC", "c-purple"], generalizedInverse: ["M⁺", "c-orange"],
    syntheticDivision: ["÷", "c-green"], algorithmDivision: ["gcd", "c-blue"],
    auxiliary: ["rᵢ", "c-cyan"], toLatex: ["TeX", "c-purple"],
  };

  /* ================= 主页菜单（磁贴网格） ================= */
  function renderHome() {
    var host = document.getElementById("homeMenu");
    host.innerHTML = "";
    FNS.forEach(function (g) {
      var t = document.createElement("div");
      t.className = "group-title";
      t.innerHTML = '<span></span><small></small>';
      t.firstChild.textContent = g.g;
      t.lastChild.textContent = g.items.length + " 项";
      host.appendChild(t);
      var grid = document.createElement("div"); grid.className = "tile-grid";
      g.items.forEach(function (f, i) {
        var tile = document.createElement("div");
        tile.className = "tile fade-up";
        tile.style.animationDelay = (i * 30) + "ms";
        var ico = ICO[f.id] || ["◻", "c-green"];
        tile.innerHTML = '<div class="ico ' + ico[1] + '"></div><div class="name"></div>';
        tile.querySelector(".ico").textContent = ico[0];
        tile.querySelector(".name").textContent = f.label;
        tile.addEventListener("click", function () { location.hash = "#/fn/" + f.id; });
        grid.appendChild(tile);
      });
      host.appendChild(grid);
    });
  }

  /* ================= 网格矩阵编辑器 ================= */
  var MAXDIM = 9;
  function GridEditor(spec, initial) {
    this.mode = spec.mode;         // matrix | square | augmented | triu
    this.rows = parseGrid(initial, spec.mode);
    this.el = null;
  }
  function parseGrid(text, mode) {
    var lines = String(text).replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    var rows = lines.map(function (l) { return l.trim().split(/\s+/); });
    if (mode === "square") {
      var lens = rows.map(function (r) { return r.length; });
      lens.push(rows.length, 1);
      var n = Math.min(Math.max.apply(null, lens), MAXDIM);
      var out = [];
      for (var i = 0; i < n; i++) {
        var r = [];
        for (var j = 0; j < n; j++) r.push(rows[i] && rows[i][j] ? rows[i][j] : "");
        out.push(r);
      }
      return out;
    }
    return rows.length ? rows : [[""]];
  }
  GridEditor.prototype.render = function (el) {
    var self = this;
    this.el = el;
    el.innerHTML = "";
    var wrap = document.createElement("div"); wrap.className = "grid-wrap";
    var table = document.createElement("table"); table.className = "grid-table";
    this.rows.forEach(function (row, i) {
      var tr = document.createElement("tr");
      row.forEach(function (v, j) {
        var td = document.createElement("td");
        if (self.mode === "augmented" && j === row.length - 1 && row.length > 1) {
          td.className = "gap"; td = document.createElement("td");
          td.appendChild(mkCell(self, i, j, "auglast"));
          tr.appendChild(td); return;
        }
        td.appendChild(mkCell(self, i, j, ""));
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    el.appendChild(wrap);

    var tools = document.createElement("div"); tools.className = "grid-tools";
    addTool(tools, "＋ 行", function () { self.addRow(); });
    addTool(tools, "＋ 列", function () { self.addCol(); });
    addTool(tools, "－ 行", function () { self.delRow(); }, "danger");
    addTool(tools, "－ 列", function () { self.delCol(); }, "danger");
    el.appendChild(tools);
    function addTool(host, label, fn, cls) {
      var t = document.createElement("div");
      t.className = "tool" + (cls ? " " + cls : "");
      t.textContent = label;
      t.addEventListener("click", fn);
      host.appendChild(t);
    }
  };
  function mkCell(self, i, j, extra) {
    var inp = document.createElement("input");
    inp.className = "cell" + (extra ? " " + extra : "");
    inp.value = self.rows[i][j] === "0" ? "" : self.rows[i][j];
    inp.dataset.i = i; inp.dataset.j = j;
    inp.addEventListener("input", function () {
      self.rows[i][j] = inp.value;
      if (inp.value.length >= 2) focusNext(self, i, j);
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); focusNext(self, i, j); }
    });
    inp.addEventListener("paste", function (e) {
      var t = (e.clipboardData || window.clipboardData).getData("text");
      if (t && t.indexOf("\n") >= 0 || /\s/.test(t) && t.split(/\s+/).length > 1) {
        e.preventDefault();
        self.setText(t);
      }
    });
    return inp;
  }
  function focusNext(self, i, j) {
    if (!self.el) return;
    var c = self.rows[0] ? self.rows[0].length : 0;
    var ni = j + 1 < self.rows[i].length ? i : i + 1;
    var nj = j + 1 < self.rows[i].length ? j + 1 : 0;
    if (ni >= self.rows.length) return;
    var cell = self.el.querySelector('.cell[data-i="' + ni + '"][data-j="' + nj + '"]');
    if (cell) cell.focus();
  }
  GridEditor.prototype.addRow = function () {
    if (this.rows.length >= MAXDIM) return;
    var cols = this.rows[0].length;
    if (this.mode === "triu") cols = this.rows.length + 1;
    var row = []; for (var j = 0; j < cols; j++) row.push("");
    this.rows.push(row);
    if (this.mode === "square") this.rows.forEach(function (r) { while (r.length < cols) r.push(""); });
    this.render(this.el);
  };
  GridEditor.prototype.addCol = function () {
    var self = this;
    if (this.rows[0].length >= MAXDIM) return;
    this.rows.forEach(function (r, i) {
      if (self.mode === "augmented") r.splice(r.length - 1, 0, "");
      else if (self.mode === "triu") { if (r.length < i + 1) r.push(""); }
      else r.push("");
    });
    if (this.mode === "square") {
      if (this.rows.length < MAXDIM) this.addRow();
    }
    this.render(this.el);
  };
  GridEditor.prototype.delRow = function () {
    if (this.rows.length <= 1) return;
    this.rows.pop(); this.render(this.el);
  };
  GridEditor.prototype.delCol = function () {
    var self = this;
    var min = this.mode === "augmented" ? 2 : 1;
    if (this.rows[0].length <= min) return;
    this.rows.forEach(function (r) {
      if (self.mode === "augmented") r.splice(r.length - 2, 1); else r.pop();
    });
    this.render(this.el);
  };
  GridEditor.prototype.getText = function () {
    return this.rows.map(function (r) { return r.map(function (v) { return v === "" ? "0" : v; }).join(" "); }).join("\n");
  };
  GridEditor.prototype.setText = function (t) {
    this.rows = parseGrid(t, this.mode);
    this.render(this.el);
  };

  /* ================= 字段渲染 ================= */
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem("la_saved2") || "{}"); } catch (e) { saved = {}; }
  function persist() { try { localStorage.setItem("la_saved2", JSON.stringify(saved)); } catch (e) {} }
  var editors = []; // 当前页全部 GridEditor

  function sampleOf(f) {
    var s = {};
    f.fields.forEach(function (fd) {
      var key = fd[0], type = fd[1];
      if (type === "pick") s[key] = fd[3][0];
      else if (type === "num") s[key] = fd[3];
      else s[key] = fd[3];
    });
    if (f.id === "matrixEquation") { s.mA = "1 2\n3 4"; s.mB = "2 3\n1 4"; s.mC = "3 1\n2 3"; s.meMethod = "AX=C"; }
    if (f.id === "similarity") { s.contentA = "2 1\n1 2"; s.contentB = "3 0\n0 1"; }
    if (f.id === "transition") { s.contentA = "1 1\n1 2"; s.contentB = "3 4\n5 7"; }
    if (f.id === "matrixOperations") { s.contentA = "1 2\n3 4"; s.contentB = "0 1\n1 0"; s.base = "3/2"; s.moMethod = "*"; }
    if (f.id === "auxiliary") { s.opRecord = "r2+(-2)r1;r3+(-1)r1;"; }
    return s;
  }

  function renderInputs(f) {
    var host = document.getElementById("inputs");
    host.innerHTML = "";
    editors = [];
    var s = saved[f.id] || sampleOf(f);
    f.fields.forEach(function (fd) {
      var key = fd[0], type = fd[1], label = fd[2];
      var card = document.createElement("div"); card.className = "card";
      var t = document.createElement("div"); t.className = "card-title"; t.textContent = label;
      card.appendChild(t);
      var body = document.createElement("div");
      card.appendChild(body);
      if (type === "pick") {
        var pills = document.createElement("div"); pills.className = "pills";
        for (var i = 0; i < fd[3].length; i += 2) {
          (function (val, lab) {
            var p = document.createElement("div");
            p.className = "pill" + (s[key] === val ? " on" : "");
            p.textContent = lab;
            p.dataset.key = key; p.dataset.type = "pick"; p.dataset.val = val;
            p.addEventListener("click", function () {
              pills.querySelectorAll(".pill").forEach(function (x) { x.classList.remove("on"); });
              p.classList.add("on");
            });
            pills.appendChild(p);
          })(fd[3][i], fd[3][i + 1]);
        }
        body.appendChild(pills);
      } else if (type === "line" || type === "num") {
        var inp = document.createElement("input");
        inp.className = "line-input";
        if (type === "num") { inp.type = "number"; inp.step = "any"; }
        inp.value = s[key] !== undefined && s[key] !== "" ? s[key] : fd[3];
        inp.dataset.key = key; inp.dataset.type = type;
        body.appendChild(inp);
      } else {
        // matrix | square | augmented | triu
        var ge = new GridEditor({ mode: type }, s[key] || fd[3]);
        var holder = document.createElement("div");
        body.appendChild(holder);
        ge.render(holder);
        ge.key = key;
        editors.push(ge);
      }
      host.appendChild(card);
    });
  }

  function collect() {
    var vals = {};
    var els = document.querySelectorAll("#inputs [data-key]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      vals[el.dataset.key] = el.dataset.type === "pick" ? el.dataset.val : el.value;
    }
    editors.forEach(function (ge) { vals[ge.key] = ge.getText(); });
    return vals;
  }

  function buildBody(f, v) {
    var b = {};
    var id = f.id;
    if (id === "matrixOperations") {
      if (v.moMethod === "scalarMultiply") { b.content = v.contentA; b.base = v.base; b.methods = "scalarMultiply"; }
      else { b.contentA = v.contentA; b.contentB = v.contentB; b.methods = v.moMethod; }
      return b;
    }
    if (id === "matrixEquation") {
      b.method = v.meMethod;
      b.content = v.mB && v.mB.trim() !== "" ? [v.mA, v.mB, v.mC] : [v.mA, v.mC];
      return b;
    }
    if (id === "algebraicCofactor") {
      b.content = v.content;
      b.contentData = { method: v.cdMethod, position: v.cdPos || "1", coefficient: v.cdCoef || "" };
      return b;
    }
    if (id === "power") { b.content = v.content; b.count = v.count; return b; }
    if (id === "eigenvals") { b.content = v.content; b.mode = v.mode; return b; }
    if (id === "quadraticFormZ" || id === "quadraticFormP" || id === "quadraticFormH") { b.content = triuParse(v.content); return b; }
    if (id === "syntheticDivision" || id === "algorithmDivision") { b.content = [v.polyF, v.polyG]; return b; }
    if (id === "auxiliary") { b.content = v.content; b.op_record = v.opRecord || ""; b.history_record = [""]; return b; }
    if (id === "similarity" || id === "transition") { b.content = [v.contentA, v.contentB]; return b; }
    b.content = v.content;
    return b;
  }
  function triuParse(text) {
    return String(text).replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; })
      .map(function (l) { return l.trim().split(/\s+/); });
  }

  /* ================= 结果渲染 ================= */
  var BADGE = ["#22a94b", "#2f7dff", "#12b5cb", "#7c5cff", "#ff8a1e"];
  function latexHTML(latex, display) {
    try {
      var e = latex;
      if (e.indexOf("frac") !== -1) e = "\\def\\arraystretch{1.3}" + e;
      return katex.renderToString(e, { displayMode: !!display, strict: "ignore", throwOnError: false });
    } catch (err) { return "<code>" + String(latex).slice(0, 200) + "</code>"; }
  }
  function resCard(tagHTML, bodyHTML, cls, delay) {
    var d = document.createElement("div");
    d.className = "res-card fade-up" + (cls ? " " + cls : "");
    if (delay) d.style.animationDelay = delay + "ms";
    d.innerHTML = tagHTML + '<div class="res-body">' + bodyHTML + "</div>";
    return d;
  }
  function showResults(r) {
    var host = document.getElementById("results");
    host.innerHTML = "";
    host.classList.add("show");
    if (r.errMsg) {
      var eb = document.createElement("div"); eb.className = "errbox fade-up";
      eb.innerHTML = '<div>' + r.errMsg + "</div>"; host.appendChild(eb);
    }
    if (r.content) host.appendChild(resCard("", latexHTML(r.content, false), "echo", 0));
    if (r.textImgUrl) host.appendChild(resCard("", latexHTML(r.textImgUrl, false), "", 40));
    (r.result || []).forEach(function (item, i) {
      var color = BADGE[i % BADGE.length];
      host.appendChild(resCard('<div class="res-tag" style="background:' + color + '">' + (i + 1) + "</div>",
        latexHTML(item, false), "", 60 + i * 45));
    });
    if (r.imgUrl) host.appendChild(resCard("", latexHTML(r.imgUrl, false), "", 60));
    if (!host.children.length) host.innerHTML = '<div class="empty">无输出</div>';
    window.scrollTo(0, 0);
  }

  /* ================= 路由 ================= */
  var navBack = document.getElementById("navBack");
  var navTitle = document.getElementById("navTitle");
  var viewHome = document.getElementById("viewHome");
  var viewPage = document.getElementById("viewPage");
  var btnbar = document.getElementById("btnbar");
  var cur = null;

  function route() {
    var h = location.hash || "#/";
    var m = h.match(/^#\/fn\/(.+)$/);
    if (m) {
      var f = findFn(m[1]);
      if (f) return showFn(f);
    }
    showHome();
  }
  function showHome() {
    cur = null;
    navTitle.textContent = "首页";
    navBack.style.display = "none";
    viewHome.classList.add("active");
    viewPage.classList.remove("active");
    btnbar.style.display = "none";
    document.getElementById("results").classList.remove("show");
  }
  function showFn(f) {
    cur = f;
    navTitle.textContent = f.title || f.label;
    navBack.style.display = "block";
    viewHome.classList.remove("active");
    viewPage.classList.add("active");
    btnbar.style.display = "flex";
    var ph = document.getElementById("pageHead");
    ph.innerHTML = '<div class="page-head fade-up"><h2></h2><p></p></div>';
    ph.querySelector("h2").textContent = f.title || f.label;
    ph.querySelector("p").textContent = f.sub || "";
    renderInputs(f);
    document.getElementById("hint").textContent = f.hint || "";
    var res = document.getElementById("results");
    res.classList.add("show");
    res.innerHTML = '<div class="empty">输入数据后点「计算」</div>';
    window.scrollTo(0, 0);
  }

  navBack.addEventListener("click", function () { location.hash = "#/"; });
  document.getElementById("btnSample").addEventListener("click", function () {
    if (!cur) return;
    saved[cur.id] = sampleOf(cur); persist();
    renderInputs(cur);
  });
  document.getElementById("btnGo").addEventListener("click", function () {
    if (!cur) return;
    var vals = collect();
    saved[cur.id] = vals; persist();
    var body = buildBody(cur, vals);
    var out = { r: null };
    var handled;
    try { handled = window.__LA.go(pathOf(cur.id), { data: body }, function (r) { out.r = r; }); }
    catch (e) { out.r = { errMsg: "本地异常：" + e.message, result: [], content: "" }; handled = true; }
    if (!handled) out.r = { errMsg: "该输入暂不支持离线精确计算（例如含不可约三次及以上特征多项式、复特征值等情形）", result: [], content: "" };
    showResults(out.r);
  });

  window.addEventListener("hashchange", route);
  renderHome();
  route();
})();
