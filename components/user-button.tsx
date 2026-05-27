"use client"

import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GearSix, Scales, SignOut } from "phosphor-react"

function getInitials(name: string) {
  const parts = name.trim().split(" ")
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name[0]?.toUpperCase() ?? "?"
}

export function UserButton() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return null

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sign-in")}>
          Sign in
        </Button>
        <Button size="sm" onClick={() => router.push("/sign-up")}>
          Get started
        </Button>
      </div>
    )
  }

  const { name, email, image } = session.user

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="relative flex size-8 items-center justify-center rounded-full ring-offset-background transition hover:opacity-80 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Avatar className="size-8 border border-border">
            <AvatarImage src={image ?? undefined} alt={name} />
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-3 px-1 py-1">
                <Avatar className="size-8 border border-border">
                  <AvatarImage src={image ?? undefined} alt={name} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-medium leading-none text-foreground">{name}</p>
                  <p className="mt-1 text-xs leading-none text-muted-foreground">{email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/settings/company")} className="cursor-pointer gap-2 text-foreground">
            <GearSix size={16} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/approvals")} className="cursor-pointer gap-2 text-foreground">
            <Scales size={16} />
            Approvals
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-foreground">
            <SignOut size={16} />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
