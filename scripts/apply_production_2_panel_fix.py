from pathlib import Path


def replace_exact(path_str: str, old: str, new: str) -> bool:
    path = Path(path_str)
    source = path.read_text(encoding="utf-8")
    if old not in source:
        if new in source:
            print(f"Already patched: {path_str}")
            return False
        raise SystemExit(f"Expected production integration pattern not found in {path_str}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")
    print(f"Patched: {path_str}")
    return True


changed = False

changed |= replace_exact(
    "src/components/OrderProductionDrawer.tsx",
    "  const currentStage = getStageFromStatus(order.status);",
    "  const currentStage = getStageFromStatus(order.production?.status || order.productionStatus || order.status || 'waiting');"
)

changed |= replace_exact(
    "src/pages/AdminOrders.tsx",
    "                              value={getStageFromStatus(order.productionStatus || order.status).id}",
    "                              value={getStageFromStatus((order as any).production?.status || order.productionStatus || order.status).id}"
)

changed |= replace_exact(
    "src/pages/AdminOrders.tsx",
    """                      onStatusUpdate={async (orderId, newStatus) => {\n                        await updateStatus(orderId, newStatus as any);\n                        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o));\n                      }}""",
    """                      onStatusUpdate={async (orderId, newStatus) => {\n                        await updateProductionStatus(orderId, newStatus, user?.email || 'Admin');\n                        setOrders(prev => prev.map(o => o.id === orderId ? {\n                          ...o,\n                          productionStatus: newStatus,\n                          production: { ...(o as any).production, status: newStatus }\n                        } as any : o));\n                      }}"""
)

if not changed:
    print("No panel changes needed")
