import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit-logger"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, tag } = body

    if (!action || !tag || typeof tag !== "string") {
      return NextResponse.json(
        { success: false, error: "缺少必要参数: action, tag" },
        { status: 400 }
      )
    }

    if (action !== "add" && action !== "remove") {
      return NextResponse.json(
        { success: false, error: "action 必须是 add 或 remove" },
        { status: 400 }
      )
    }

    const doc = await prisma.document.findUnique({ where: { id } })
    if (!doc) {
      return NextResponse.json(
        { success: false, error: "文档不存在" },
        { status: 404 }
      )
    }

    const meta = (doc.metadata as Record<string, unknown>) || {}
    const lockedTags = (meta.lockedTags as string[]) || []
    if (action === "remove" && lockedTags.includes(tag)) {
      return NextResponse.json(
        { success: false, error: "系统标签不可删除" },
        { status: 400 }
      )
    }

    let newTags = [...(doc.tags || [])]
    if (action === "add") {
      if (!newTags.includes(tag)) {
        newTags.push(tag)
      }
    } else if (action === "remove") {
      newTags = newTags.filter((t) => t !== tag)
    }

    await prisma.document.update({
      where: { id },
      data: { tags: newTags },
    })

    audit("DOC_TAG_PATCH", `action=${action} tag=${tag} docId=${id}`, {
      docId: id,
      action,
      tag,
      newTags,
      isLockedTag: lockedTags.includes(tag),
    })

    return NextResponse.json({ success: true, data: { tags: newTags } })
  } catch (error) {
    console.error("Tags patch failed:", error)
    return NextResponse.json(
      { success: false, error: "标签操作失败" },
      { status: 500 }
    )
  }
}
