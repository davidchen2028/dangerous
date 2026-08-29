const LEVEL_WORDS = {
  l1: "仓库",
  l2: "管道",
  l4: "办公室",
};

const RUMORS = {
  l1: [
    "我沿着灯比较稳定的方向走。有人说这里有 M.E.G. 的 Alpha 基地，但我还没找到。",
    "这些货架后面不一定还是原来的路。你要做记号，别只相信灯光。",
    "我见过一扇白色后门。进去的人说那边是更热的管道层。",
  ],
  l2: [
    "蒸汽响起来以前，管壁会先抖一下。听见了就别站在阀门旁边。",
    "这里的岔路看着一样。我只敢记住管子上的锈斑。",
    "黑下来的那条走廊有东西。我没有看清，也不想再看一次。",
  ],
  l4: [
    "这里比别处安全，但安全不等于有人会来找你。",
    "M.E.G. 的任务板在东边前哨。民间交换通常便宜不了多少。",
    "饮水机有些还能出水，有些只剩下机器运转的声音。",
  ],
};

function pick(list, seed) {
  return list[Math.abs(seed | 0) % list.length];
}

function closeChoice() {
  return [{ key: "b", label: "离开", action: "close" }];
}

export function getWandererDialogue(npc, levelId) {
  var state = npc.state || {};
  var place = LEVEL_WORDS[levelId] || "这一层";
  var role = npc.role;

  if (state.dead) {
    return { text: "对方没有回应。", choices: closeChoice() };
  }
  if (state.hostile) {
    return { text: "对方不再回答，只盯着你手里的东西。", choices: closeChoice() };
  }
  if (state.completed) {
    return {
      text: pick(
        ["谢谢。我会记住你做过的事。", "这次算我欠你的。希望我们还能活着见面。"],
        npc.seed
      ),
      choices: closeChoice(),
    };
  }

  if (role === "ordinary") {
    return {
      text: pick(RUMORS[levelId] || RUMORS.l1, npc.seed),
      choices: closeChoice(),
    };
  }
  if (role === "injured") {
    return {
      text:
        "等等……我在" +
        place +
        "里摔伤了。你有杏仁水吗？没有的话，至少带我去灯亮、人多的地方。",
      choices: [
        { key: "a", label: "给一瓶杏仁水", action: "give_supply" },
        { key: "c", label: "带他回出生点", action: "follow" },
        { key: "b", label: "离开", action: "close" },
      ],
    };
  }
  if (role === "lost") {
    return {
      text:
        "我已经第三次走回这里了。别告诉我方向，我现在分不清。你能直接带我回出生点吗？",
      choices: [
        { key: "a", label: "带他回出生点", action: "follow" },
        { key: "b", label: "拒绝", action: "close" },
      ],
    };
  }
  if (role === "scavenger") {
    return {
      text:
        "我只捡别人不要的东西。你给我一瓶杏仁水，我把刚找到的火盐给你——别问它原来在哪。",
      choices: [
        { key: "a", label: "交换", action: "barter" },
        { key: "b", label: "不交换", action: "close" },
      ],
    };
  }
  if (role === "merchant") {
    return {
      text: "我不属于任何组织。杏仁水 10 积分，火盐 20 积分；卖完就没有了。",
      choices: [
        { key: "a", label: "买杏仁水（10）", action: "buy_water" },
        { key: "c", label: "买火盐（20）", action: "buy_salt" },
        { key: "b", label: "离开", action: "close" },
      ],
    };
  }
  if (role === "mission") {
    if (levelId === "l1") {
      return {
        text:
          "我在等一份从 Level 4 发来的 M.E.G. 包裹。送件人应该知道封条上的任务编号。",
        choices: [
          { key: "a", label: "交出任务包裹", action: "deliver_task" },
          { key: "c", label: "提供一瓶补给", action: "give_supply" },
          { key: "b", label: "离开", action: "close" },
        ],
      };
    }
    return {
      text:
        "我的小队在执行路线确认任务，但补给箱丢了。如果你能匀一瓶杏仁水，我会把你的名字写进行动记录。",
      choices: [
        { key: "a", label: "提供一瓶补给", action: "give_supply" },
        { key: "b", label: "离开", action: "close" },
      ],
    };
  }
  return {
    text: pick(
      [
        "把你的一瓶杏仁水留下，然后走你的路。别逼我自己拿。",
        "我知道一条近路。先把补给给我，我再告诉你入口在哪。",
        "你一个人在这里？把背包放下，我们都省点麻烦。",
      ],
      npc.seed
    ),
    choices: [
      { key: "a", label: "给他杏仁水", action: "appease" },
      { key: "c", label: "拒绝并后退", action: "refuse" },
      { key: "b", label: "结束交谈", action: "close" },
    ],
  };
}
