"use client";

// Knowledge base: FAQ management with search/filter, create/edit/delete dialogs; AI uses articles for reply drafting.
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/api-client";
import { CATEGORIES, formatRelative } from "@/lib/ticket-meta";
import { useRefreshAll } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import type { FAQ } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Lozenge } from "@/components/ui/lozenge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, Pencil, Trash2, SearchX, BookOpen, ChevronDown } from "lucide-react";

import { ArticleDialog } from "./article-dialog";
import { DeleteArticleDialog } from "./delete-article-dialog";

interface FaqsResponse {
	faqs: FAQ[];
	total: number;
	page: number;
	limit: number;
}

export function KnowledgeBase() {
	const session = useSession();
	const userRole = session.data?.user.role;
	// Only admins manage the knowledge base; agents and viewers get read-only access.
	const isAdmin = userRole === "admin";

	const { data, error, isLoading, mutate } = useSWR<FaqsResponse>("/api/faqs", apiGet);
	const refreshAll = useRefreshAll();

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingArticle, setEditingArticle] = useState<FAQ | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [articleToDelete, setArticleToDelete] = useState<FAQ | null>(null);

	const handleOpenDialog = useCallback(() => {
		setEditingArticle(null);
		setDialogOpen(true);
	}, []);

	const handleEditArticle = useCallback((article: FAQ) => {
		setEditingArticle(article);
		setDialogOpen(true);
	}, []);

	const handleDeleteArticle = useCallback((article: FAQ) => {
		setArticleToDelete(article);
		setDeleteDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setEditingArticle(null);
	}, []);

	const handleDeleteDialogClose = useCallback(() => {
		setDeleteDialogOpen(false);
		setArticleToDelete(null);
	}, []);

	// Filter articles
	const filteredArticles = useMemo(() => {
		if (!data?.faqs) return [];

		return data.faqs.filter((article) => {
			const matchesSearch =
				!searchQuery ||
				article.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
				article.answer.toLowerCase().includes(searchQuery.toLowerCase());

			const matchesCategory = !selectedCategory || article.category === selectedCategory;

			return matchesSearch && matchesCategory;
		});
	}, [data, searchQuery, selectedCategory]);

	const handleClearSearch = useCallback(() => {
		setSearchQuery("");
		setSelectedCategory(null);
	}, []);

	const handleRefresh = useCallback(async () => {
		await mutate();
		refreshAll();
	}, [mutate, refreshAll]);

	// Loading state
	if (isLoading) {
		return (
			<Panel>
				<ul className="divide-y divide-border">
					{Array.from({ length: 5 }).map((_, i) => (
						<li key={i} className="px-4 py-3">
							<Skeleton className="mb-2 h-5 w-1/2" />
							<Skeleton className="h-4 w-full" />
							<Skeleton className="mt-2 h-3 w-1/3" />
						</li>
					))}
				</ul>
			</Panel>
		);
	}

	// Error state
	if (error) {
		return (
			<ErrorState
				title="Failed to load articles"
				message={error instanceof Error ? error.message : "An error occurred"}
				onRetry={handleRefresh}
			/>
		);
	}

	// Empty state
	if (!data?.faqs || data.faqs.length === 0) {
		return (
			<EmptyState
				icon={BookOpen}
				title="No articles yet"
				description="Add answers to common questions. The AI uses them to draft replies and to match incoming tickets."
				action={isAdmin ? <Button onClick={handleOpenDialog} variant="primary" size="sm"><Plus className="mr-2 h-4 w-4" />New article</Button> : undefined}
			/>
		);
	}

	// No search results
	if (filteredArticles.length === 0) {
		return (
			<EmptyState
				icon={SearchX}
				title="No articles match"
				action={<Button onClick={handleClearSearch} variant="secondary" size="sm">Clear search</Button>}
			/>
		);
	}

	return (
		<>
			{/* Toolbar */}
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="relative flex-1 min-w-[200px]">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-subtlest" aria-hidden="true" />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.currentTarget.value)}
						placeholder="Search articles..."
						className="pl-8"
						aria-label="Search articles"
					/>
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="secondary" size="sm">
							{selectedCategory || "All categories"}
							<ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuLabel>Category</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup
							value={selectedCategory || "all"}
							onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}
						>
							<DropdownMenuRadioItem value="all">All categories</DropdownMenuRadioItem>
							{CATEGORIES.map((category) => (
								<DropdownMenuRadioItem key={category} value={category}>
									{category}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>

				<span className="ml-auto text-xs text-subtlest">{filteredArticles.length} articles</span>

				{isAdmin && (
					<Button onClick={handleOpenDialog} variant="primary" size="sm">
						<Plus className="h-4 w-4" aria-hidden="true" />
						<span className="ml-1">New article</span>
					</Button>
				)}
			</div>

			{/* Articles List */}
			<Panel>
				<ul className="divide-y divide-border">
					{filteredArticles.map((article) => {
						const isExpanded = expandedId === article.id;

						return (
							<li key={article.id}>
								<button
									onClick={() => setExpandedId(isExpanded ? null : article.id)}
									aria-expanded={isExpanded}
									className="w-full text-left px-4 py-3 hover:bg-fill transition-colors"
								>
									<div className="flex items-start justify-between">
										<div className="flex-1 min-w-0">
											<div className="text-sm font-semibold text-foreground">{article.question}</div>
											<div className="mt-1 flex items-center gap-2">
												<Lozenge appearance="default">{article.category}</Lozenge>
											</div>
											<p className="mt-2 line-clamp-2 text-sm text-subtle">{article.answer}</p>
											{(article.times_used !== undefined ||
												article.success_rate !== undefined ||
												article.created_at) && (
												<div className="mt-2 flex flex-wrap gap-3 text-xs text-subtlest">
													{typeof article.times_used === "number" && (
														<span>{article.times_used} times used</span>
													)}
													{typeof article.success_rate === "number" && (
														<span>
															{Math.round(article.success_rate * 100)}% success rate
														</span>
													)}
													{article.created_at && (
														<span>Updated {formatRelative(article.created_at)}</span>
													)}
												</div>
											)}
										</div>
										{isAdmin && (
											<div className="ml-2 flex items-center gap-1">
												<Tooltip content="Edit article">
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleEditArticle(article);
														}}
														aria-label={`Edit article: ${article.question}`}
														className="p-1.5 hover:bg-fill rounded-md transition-colors"
													>
														<Pencil className="h-4 w-4 text-subtle" aria-hidden="true" />
													</button>
												</Tooltip>
												<Tooltip content="Delete article">
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleDeleteArticle(article);
														}}
														aria-label={`Delete article: ${article.question}`}
														className="p-1.5 hover:bg-fill rounded-md transition-colors"
													>
														<Trash2 className="h-4 w-4 text-subtle" aria-hidden="true" />
													</button>
												</Tooltip>
											</div>
										)}
									</div>
								</button>

								{/* Expanded view */}
								{isExpanded && (
									<div className={cn("border-t border-border bg-sunken px-4 py-3", "text-sm")}>
										<div className="mb-3">
											<h3 className="font-semibold text-foreground mb-2">Answer</h3>
											<p className="text-subtle whitespace-pre-wrap">{article.answer}</p>
										</div>

										{article.solution_steps && article.solution_steps.length > 0 && (
											<div className="mb-3">
												<h3 className="font-semibold text-foreground mb-2">Steps</h3>
												<ol className="list-decimal list-inside space-y-1 text-subtle">
													{article.solution_steps.map((step, idx) => (
														<li key={idx}>{step}</li>
													))}
												</ol>
											</div>
										)}

										{(article.video_url || article.manual_ref) && (
											<div>
												<h3 className="font-semibold text-foreground mb-2">Resources</h3>
												<div className="space-y-1">
													{article.video_url &&
														article.video_url.startsWith("http") && (
															<a
																href={article.video_url}
																target="_blank"
																rel="noopener noreferrer"
																className="block text-primary hover:underline"
															>
																Video →
															</a>
														)}
													{article.manual_ref &&
														article.manual_ref.startsWith("http") && (
															<a
																href={article.manual_ref}
																target="_blank"
																rel="noopener noreferrer"
																className="block text-primary hover:underline"
															>
																Manual →
															</a>
														)}
												</div>
											</div>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			</Panel>

			{/* Dialogs */}
			{dialogOpen && (
				<ArticleDialog
					article={editingArticle}
					open={dialogOpen}
					onOpenChange={handleDialogClose}
					onSuccess={() => {
						handleDialogClose();
						refreshAll();
					}}
				/>
			)}

			{deleteDialogOpen && articleToDelete && (
				<DeleteArticleDialog
					article={articleToDelete}
					open={deleteDialogOpen}
					onOpenChange={handleDeleteDialogClose}
					onSuccess={() => {
						handleDeleteDialogClose();
						refreshAll();
					}}
				/>
			)}
		</>
	);
}
